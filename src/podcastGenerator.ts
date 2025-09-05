/**
 * 播客生成器
 * 基于火山引擎 Podcast TTS API
 */

import { writeFile } from '@tauri-apps/plugin-fs';
import { tempDir } from '@tauri-apps/api/path';
import TauriWebSocket from '@tauri-apps/plugin-websocket';
import type { Message as WSMessage } from '@tauri-apps/plugin-websocket';
import { 
  EventType, 
  MsgType, 
  unmarshalMessage, 
  createMessage, 
  marshalMessage,
  MsgTypeFlagBits,
  Message
} from './protocols';

// 生成 UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 生成临时文件前缀
function generateTempFilePrefix(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `broadcast_${timestamp}_${random}_`;
}

export interface PodcastParams {
  appId: string;
  accessKey: string;
  input_id?: string;
  input_text?: string;
  prompt_text?: string;
  action?: number;
  speaker_info?: {
    random_order?: boolean;
  };
  nlp_texts?: Array<{
    speaker: string;
    text: string;
  }>;
  use_head_music?: boolean;
  use_tail_music?: boolean;
  input_info?: {
    input_url?: string;
    return_audio_url?: boolean;
    only_nlp_text?: boolean;
  };
  audio_config?: {
    format?: string;
    sample_rate?: number;
    speech_rate?: number;
  };
  resource_id?: string;
}

export interface ProgressUpdate {
  status: 'connecting' | 'connected' | 'starting' | 'session_started' | 'processing' | 
          'receiving_audio' | 'round_started' | 'round_completed' | 'finalizing' | 
          'completed' | 'error';
  message: string;
  progress: number;
  audioFile?: string;
  audioData?: Uint8Array; // 添加音频数据字段
  textFile?: string;
  podcastTexts?: Array<{
    speaker: string;
    text: string;
  }>;
  error?: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export class PodcastGenerator {
  private ws: TauriWebSocket | null = null;
  private messageQueue: Message[] = [];
  private messageCallbacks: Array<(msg: Message) => void> = [];
  private tempFilePrefix: string;

  constructor() {
    this.tempFilePrefix = generateTempFilePrefix();
    console.log(`初始化播客生成器，临时文件前缀: ${this.tempFilePrefix}`);
  }

  /**
   * 生成播客
   */
  async generatePodcast(params: PodcastParams, progressCallback: ProgressCallback): Promise<void> {
    const ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sami/podcasttts';
    
    // 构建请求头
    const headers: Record<string, string> = {
      'X-Api-App-Id': params.appId,
      'X-Api-App-Key': 'aGjiRDfUWi',
      'X-Api-Access-Key': params.accessKey,
      'X-Api-Resource-Id': params.resource_id || 'volc.service_type.10050',
      'X-Api-Connect-Id': generateUUID(),
    };

    let isPodcastRoundEnd = true;
    let audioReceived = false;
    let lastRoundID = -1;
    let taskID = '';
    let retryNum = 3;
    const podcastAudio: Uint8Array[] = [];
    let audio: Uint8Array[] = [];
    let voice = '';
    let currentRound = 0;
    const podcastTexts: Array<{speaker: string, text: string}> = [];

    try {
      progressCallback({ 
        status: 'connecting', 
        message: '正在连接火山引擎服务器...', 
        progress: 10 
      });

      while (retryNum > 0) {
        // 建立 WebSocket 连接
        await this.connect(ENDPOINT, headers);

        progressCallback({ 
          status: 'connected', 
          message: 'WebSocket连接成功', 
          progress: 20 
        });

        const reqParams = {
          input_id: params.input_id || `podcast_${Date.now()}`,
          input_text: params.input_text || '',
          prompt_text: params.prompt_text || '',
          action: params.action || 0,
          speaker_info: params.speaker_info || { random_order: false },
          nlp_texts: params.nlp_texts || [],
          use_head_music: params.use_head_music !== false,
          use_tail_music: params.use_tail_music === true,
          input_info: {
            input_url: params.input_info?.input_url || '',
            return_audio_url: params.input_info?.return_audio_url === true,
            only_nlp_text: params.input_info?.only_nlp_text === true,
          },
          audio_config: {
            format: params.audio_config?.format || 'mp3',
            sample_rate: 24000,
            speech_rate: params.audio_config?.speech_rate || 0,
          },
        };

        if (!isPodcastRoundEnd) {
          (reqParams as any).retry_info = {
            retry_task_id: taskID,
            last_finished_round_id: lastRoundID,
          };
        }

        progressCallback({ 
          status: 'starting', 
          message: '正在启动会话...', 
          progress: 30 
        });

        // Start connection [event=1]
        await this.startConnection();
        // Connection started [event=50]
        await this.waitForEvent(MsgType.FullServerResponse, EventType.ConnectionStarted);

        const sessionID = generateUUID();
        if (!taskID) taskID = sessionID;

        progressCallback({ 
          status: 'session_started', 
          message: '会话已启动，正在处理请求...', 
          progress: 40 
        });

        // Start session [event=100]
        await this.startSession(new TextEncoder().encode(JSON.stringify(reqParams)), sessionID);
        // Session started [event=150]
        await this.waitForEvent(MsgType.FullServerResponse, EventType.SessionStarted);
        // Finish session [event=102]
        await this.finishSession(sessionID);

        progressCallback({ 
          status: 'processing', 
          message: '正在生成播客内容...', 
          progress: 50 
        });

        while (true) {
          // 接收响应内容
          const msg = await this.receiveMessage();
          console.log('收到消息:', msg.toString());

          switch (msg.type) {
            // 音频数据块
            case MsgType.AudioOnlyServer: {
              if (msg.event === EventType.PodcastRoundResponse) {
                if (!audioReceived && audio.length > 0) {
                  audioReceived = true;
                }
                audio.push(msg.payload);
                console.log(`接收到音频数据块 | 大小: ${msg.payload.length} bytes`);
                progressCallback({ 
                  status: 'receiving_audio', 
                  message: `正在接收音频数据... (${audio.length}块)`, 
                  progress: Math.min(50 + audio.length * 2, 80) 
                });
              }
              break;
            }
            
            // 错误信息
            case MsgType.Error: {
              const errorMsg = new TextDecoder().decode(msg.payload);
              console.error('服务器错误:', errorMsg);
              throw new Error(`服务器错误: ${errorMsg}`);
            }
            
            case MsgType.FullServerResponse: {
              // 播客round开始
              if (msg.event === EventType.PodcastRoundStart) {
                const data = JSON.parse(new TextDecoder().decode(msg.payload));
                if (params.input_info?.only_nlp_text) {
                  podcastTexts.push({
                    speaker: data.speaker,
                    text: data.text,
                  });
                }
                voice = data.speaker || 'head_music';
                currentRound = data.round_id;
                if (currentRound === 9999) {
                  voice = 'tail_music';
                }
                isPodcastRoundEnd = false;
                progressCallback({ 
                  status: 'round_started', 
                  message: `正在处理第${currentRound}轮内容...`, 
                  progress: Math.min(60 + currentRound * 5, 85) 
                });
              } 
              // 播客round结束
              else if (msg.event === EventType.PodcastRoundEnd) {
                const data = JSON.parse(new TextDecoder().decode(msg.payload));
                const isErr = data.is_error || false;
                if (isErr) {
                  console.log(`播客轮次结束时出错: ${JSON.stringify(data)}`);
                  break;
                }
                isPodcastRoundEnd = true;
                lastRoundID = currentRound;
                if (audio.length > 0) {
                  // 保存当前音频到临时文件夹
                  const filename = `${voice}_${currentRound}.${params.audio_config?.format || 'mp3'}`;
                  const combinedAudio = this.combineUint8Arrays(audio);
                  try {
                    const tempPath = await tempDir();
                    const fullPath = `${tempPath}/${this.tempFilePrefix}${filename}`;
                    await writeFile(fullPath, combinedAudio);
                    console.log(`保存部分音频到临时目录: ${fullPath}`);
                  } catch (error) {
                    console.warn('保存部分音频失败:', error);
                  }
                  podcastAudio.push(...audio);
                  audio = [];
                }
                progressCallback({ 
                  status: 'round_completed', 
                  message: `第${currentRound}轮处理完成`, 
                  progress: Math.min(70 + currentRound * 5, 90) 
                });
              } 
              else if (msg.event === EventType.PodcastEnd) {
                const data = JSON.parse(new TextDecoder().decode(msg.payload));
                console.log(`播客生成结束: ${JSON.stringify(data)}`);
                progressCallback({ 
                  status: 'finalizing', 
                  message: '播客生成完成，正在保存文件...', 
                  progress: 95 
                });
              }
              break;
            }
          }
          
          // 会话结束
          if (msg.event === EventType.SessionFinished) {
            break;
          }
        }
        
        // 保持连接，等待下一轮播客
        await this.finishConnection();
        await this.waitForEvent(MsgType.FullServerResponse, EventType.ConnectionFinished);
        
        // 播客结束，保存最终音频到临时文件夹
        if (isPodcastRoundEnd) {
          const audioFilename = `podcast_final_${Date.now()}.${params.audio_config?.format || 'mp3'}`;
          const textFilename = `podcast_final_${Date.now()}.json`;
          const tempPath = await tempDir();
          console.log(`使用系统临时目录: ${tempPath}`);
          
          if (podcastAudio.length > 0) {
            const finalAudio = this.combineUint8Arrays(podcastAudio);
            try {
              const audioPath = `${tempPath}/${this.tempFilePrefix}${audioFilename}`;
              await writeFile(audioPath, finalAudio);
              console.log(`最终音频已保存到临时目录: ${audioPath}`);
              console.log(`音频文件大小: ${finalAudio.length} bytes`);
            } catch (error) {
              console.error('保存最终音频失败:', error);
            }
          }
          
          if (podcastTexts.length > 0 && params.input_info?.only_nlp_text) {
            try {
              const textPath = `${tempPath}/${this.tempFilePrefix}${textFilename}`;
              await writeFile(textPath, new TextEncoder().encode(JSON.stringify(podcastTexts, null, 2)));
              console.log(`播客文本已保存到临时目录: ${textPath}`);
            } catch (error) {
              console.error('保存播客文本失败:', error);
            }
          }
          
          progressCallback({ 
            status: 'completed', 
            message: '播客生成完成！', 
            progress: 100,
            audioFile: podcastAudio.length > 0 ? audioFilename : undefined,
            audioData: podcastAudio.length > 0 ? this.combineUint8Arrays(podcastAudio) : undefined,
            textFile: podcastTexts.length > 0 ? textFilename : undefined,
            podcastTexts: podcastTexts
          });
          
          break;
        } else {
          console.log(`当前播客未完成，从第${lastRoundID}轮继续...`);
          retryNum--;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (retryNum === 0 && !isPodcastRoundEnd) {
        throw new Error('播客生成失败，已达到最大重试次数');
      }
      
    } finally {
      if (this.ws) {
        try {
          await this.ws.disconnect();
        } catch (error) {
          console.warn('断开连接时出错:', error);
        }
        this.ws = null;
        this.messageQueue = [];
        this.messageCallbacks = [];
      }
    }
  }

  /**
   * 连接 WebSocket
   */
  private async connect(url: string, headers: Record<string, string>): Promise<void> {
    try {
      console.log('使用 Tauri WebSocket 插件连接:', url);
      console.log('请求头:', headers);
      
      // 使用 Tauri WebSocket 插件，支持自定义头部
      this.ws = await TauriWebSocket.connect(url, {
        headers: headers
      });
      
      console.log('Tauri WebSocket 连接成功');
      this.setupMessageHandler();
      
    } catch (error) {
      console.error('Tauri WebSocket 连接失败:', error);
      throw new Error(`WebSocket 连接失败: ${error}`);
    }
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandler(): void {
    if (!this.ws) return;

    // 使用 Tauri WebSocket 的 addListener 方法
    this.ws.addListener((message: WSMessage) => {
      try {
        let data: Uint8Array;
        
        if (message.type === 'Binary') {
          // Tauri WebSocket 返回的是 number[] 格式的二进制数据
          data = new Uint8Array(message.data);
        } else if (message.type === 'Text') {
          // 文本消息转换为 Uint8Array
          data = new TextEncoder().encode(message.data);
        } else if (message.type === 'Close') {
          console.log('WebSocket 连接已关闭');
          this.ws = null;
          this.messageQueue = [];
          this.messageCallbacks = [];
          return;
        } else {
          // 忽略 Ping/Pong 消息
          return;
        }

        const msg = unmarshalMessage(data);

        // 处理消息队列
        if (this.messageCallbacks.length > 0) {
          const callback = this.messageCallbacks.shift();
          if (callback) {
            callback(msg);
          }
        } else {
          this.messageQueue.push(msg);
        }

      } catch (error) {
        console.error('解析消息失败:', error);
      }
    });
  }

  /**
   * 发送消息
   */
  private async send(data: Uint8Array): Promise<void> {
    if (!this.ws) {
      throw new Error('WebSocket 未连接');
    }

    try {
      // 将 Uint8Array 转换为 number[] 格式，这是 Tauri WebSocket 期望的格式
      const numberArray = Array.from(data);
      await this.ws.send(numberArray);
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }

  /**
   * 接收消息
   */
  private async receiveMessage(): Promise<Message> {
    return new Promise((resolve, reject) => {
      // 检查消息队列
      if (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        if (msg) {
          resolve(msg);
          return;
        }
      }

      // 等待新消息
      const timeout = setTimeout(() => {
        const index = this.messageCallbacks.findIndex(cb => cb === resolver);
        if (index !== -1) {
          this.messageCallbacks.splice(index, 1);
        }
        reject(new Error('接收消息超时'));
      }, 30000);

      const resolver = (msg: Message) => {
        clearTimeout(timeout);
        resolve(msg);
      };

      this.messageCallbacks.push(resolver);
    });
  }

  /**
   * 等待特定事件
   */
  private async waitForEvent(msgType: number, eventType: number): Promise<Message> {
    const msg = await this.receiveMessage();
    if (msg.type !== msgType || msg.event !== eventType) {
      throw new Error(
        `期望的消息类型: ${msgType}, 事件: ${eventType}, 但收到: 类型=${msg.type}, 事件=${msg.event || 0}`
      );
    }
    return msg;
  }

  /**
   * 开始连接
   */
  private async startConnection(): Promise<void> {
    const msg = createMessage(MsgType.FullClientRequest, MsgTypeFlagBits.WithEvent);
    msg.event = EventType.StartConnection;
    msg.payload = new TextEncoder().encode('{}');
    console.log('发送:', msg.toString());
    const data = marshalMessage(msg);
    await this.send(data);
  }

  /**
   * 结束连接
   */
  private async finishConnection(): Promise<void> {
    const msg = createMessage(MsgType.FullClientRequest, MsgTypeFlagBits.WithEvent);
    msg.event = EventType.FinishConnection;
    msg.payload = new TextEncoder().encode('{}');
    console.log('发送:', msg.toString());
    const data = marshalMessage(msg);
    await this.send(data);
  }

  /**
   * 开始会话
   */
  private async startSession(payload: Uint8Array, sessionId: string): Promise<void> {
    const msg = createMessage(MsgType.FullClientRequest, MsgTypeFlagBits.WithEvent);
    msg.event = EventType.StartSession;
    msg.sessionId = sessionId;
    msg.payload = payload;
    console.log('发送:', msg.toString());
    const data = marshalMessage(msg);
    await this.send(data);
  }

  /**
   * 结束会话
   */
  private async finishSession(sessionId: string): Promise<void> {
    const msg = createMessage(MsgType.FullClientRequest, MsgTypeFlagBits.WithEvent);
    msg.event = EventType.FinishSession;
    msg.sessionId = sessionId;
    msg.payload = new TextEncoder().encode('{}');
    console.log('发送:', msg.toString());
    const data = marshalMessage(msg);
    await this.send(data);
  }

  /**
   * 合并 Uint8Array 数组
   */
  private combineUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    return result;
  }
}
