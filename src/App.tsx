import { useState, useEffect } from "react";
import "./App.css";
import { PodcastGenerator, PodcastParams, ProgressUpdate } from "./podcastGenerator";
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeFile, readFile } from '@tauri-apps/plugin-fs';
import mammoth from 'mammoth';

function App() {
  // 状态管理
  const [appId, setAppId] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [actionType, setActionType] = useState("0");
  const [inputText, setInputText] = useState("人工智能技术在日常生活中的应用越来越广泛，从语音助手到智能家居，从推荐系统到自动驾驶，人工智能正在改变我们的生活方式。今天我们来讨论一下人工智能的发展趋势和未来展望。");
  const [inputUrl, setInputUrl] = useState("");
  const [promptText, setPromptText] = useState("");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [speechRate, setSpeechRate] = useState(0);
  const [randomOrder, setRandomOrder] = useState(true);
  const [useHeadMusic, setUseHeadMusic] = useState(true);
  const [useTailMusic, setUseTailMusic] = useState(false);
  const [onlyNlpText, setOnlyNlpText] = useState(false);
  
  // 新增状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [generatedAudioFile, setGeneratedAudioFile] = useState<string>("");
  const [generatedAudioData, setGeneratedAudioData] = useState<Uint8Array | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string>("");
  const [generatedTextFile, setGeneratedTextFile] = useState<string>("");
  const [podcastTexts, setPodcastTexts] = useState<Array<{speaker: string, text: string}>>([]);
  
  // 文件上传状态
  const [fileUploadStatus, setFileUploadStatus] = useState({ message: "", type: "", show: false });

  // 对话列表状态
  const [dialogs, setDialogs] = useState([
    { speaker: "zh_male_dayi_v2_saturn_bigtts", text: "大家好，欢迎收听今天的播客！" },
    { speaker: "zh_female_mizai_v2_saturn_bigtts", text: "是的，今天我们要聊一个很有趣的话题。" }
  ]);
  
  // 对话验证状态 - 跟踪每个对话文本是否超长
  const [dialogErrors, setDialogErrors] = useState<boolean[]>([]);

  // 验证对话文本长度
  const validateDialogText = (text: string): boolean => {
    return text.length > 300;
  };

  // 更新对话验证状态
  const updateDialogErrors = (newDialogs: Array<{speaker: string, text: string}>) => {
    const errors = newDialogs.map(dialog => validateDialogText(dialog.text));
    setDialogErrors(errors);
  };

  // 组件初始化时加载保存的配置
  useEffect(() => {
    const loadConfig = () => {
      try {
        const savedAppId = localStorage.getItem('appId');
        const savedAccessKey = localStorage.getItem('accessKey');
        
        if (savedAppId) setAppId(savedAppId);
        if (savedAccessKey) setAccessKey(savedAccessKey);
      } catch (error) {
        console.log('首次启动，无保存的配置');
      }
    };
    
    loadConfig();
  }, []);

  // 初始化对话验证状态
  useEffect(() => {
    updateDialogErrors(dialogs);
  }, [dialogs.length]); // 只在对话数组长度变化时重新验证

  // 保存配置到本地存储
  const saveConfig = (newAppId: string, newAccessKey: string) => {
    try {
      localStorage.setItem('appId', newAppId);
      localStorage.setItem('accessKey', newAccessKey);
    } catch (error) {
      console.error('保存配置失败:', error);
    }
  };

  // 修改appId和accessKey的更新处理器，添加自动保存
  const handleAppIdChange = (value: string) => {
    setAppId(value);
    if (value && accessKey) {
      saveConfig(value, accessKey);
    }
  };

  const handleAccessKeyChange = (value: string) => {
    setAccessKey(value);
    if (appId && value) {
      saveConfig(appId, value);
    }
  };

  // 添加对话
  const addDialog = () => {
    const newDialogs = [...dialogs, { speaker: "zh_male_dayi_v2_saturn_bigtts", text: "" }];
    setDialogs(newDialogs);
    updateDialogErrors(newDialogs);
  };

  // 删除对话
  const removeDialog = (index: number) => {
    const newDialogs = dialogs.filter((_, i) => i !== index);
    setDialogs(newDialogs);
    updateDialogErrors(newDialogs);
  };

  // 更新对话
  const updateDialog = (index: number, field: "speaker" | "text", value: string) => {
    const newDialogs = [...dialogs];
    newDialogs[index][field] = value;
    setDialogs(newDialogs);
    updateDialogErrors(newDialogs);
  };

  // 清空对话
  const clearDialogs = () => {
    setDialogs([]);
    setDialogErrors([]);
  };

  // 文件上传处理
  const handleFileUpload = async () => {
    try {
      // 使用 Tauri 对话框选择文件
      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'Document',
          extensions: ['txt', 'doc', 'docx']
        }]
      });

      if (!filePath) return;

      setFileUploadStatus({ message: "正在解析文件...", type: "info", show: true });

      let text = '';

      // 判断文件类型并读取内容
      if (typeof filePath === 'string') {
        if (filePath.toLowerCase().endsWith('.txt')) {
          // 处理 TXT 文件
          const fileContent = await readFile(filePath);
          text = new TextDecoder('utf-8').decode(fileContent);
        } else if (filePath.toLowerCase().endsWith('.docx') || filePath.toLowerCase().endsWith('.doc')) {
          // 处理 Word 文档
          const fileContent = await readFile(filePath);
          const result = await mammoth.extractRawText({ arrayBuffer: fileContent.buffer });
          text = result.value;
        } else {
          throw new Error('不支持的文件格式，请选择 .txt、.doc 或 .docx 文件');
        }

        // 解析对话内容
        const parsedDialogs = parseDialogText(text);

        if (parsedDialogs.length === 0) {
          throw new Error('未找到有效的对话内容，请检查文件格式');
        }

        // 清空现有对话并添加解析的对话
        setDialogs(parsedDialogs);
        updateDialogErrors(parsedDialogs);

        setFileUploadStatus({ 
          message: `成功导入 ${parsedDialogs.length} 轮对话`, 
          type: "success", 
          show: true 
        });

        // 3秒后隐藏状态
        setTimeout(() => {
          setFileUploadStatus({ message: "", type: "", show: false });
        }, 3000);
      }

    } catch (error) {
      console.error('文件解析错误:', error);
      setFileUploadStatus({ 
        message: `解析失败: ${error instanceof Error ? error.message : '未知错误'}`, 
        type: "error", 
        show: true 
      });

      // 5秒后隐藏错误状态
      setTimeout(() => {
        setFileUploadStatus({ message: "", type: "", show: false });
      }, 5000);
    }
  };

  // 解析对话文本
  const parseDialogText = (text: string) => {
    const dialogs: Array<{speaker: string, text: string}> = [];
    const lines = text.split('\n');
    let currentDialog: {speaker: string, text: string} | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行
      if (line === '') {
        // 如果有当前对话，保存并重置
        if (currentDialog && currentDialog.text.trim()) {
          dialogs.push({
            speaker: mapSpeakerName(currentDialog.speaker),
            text: currentDialog.text.trim()
          });
          currentDialog = null;
        }
        continue;
      }

      // 检查是否包含冒号分隔符
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0 && colonIndex < line.length - 1) {
        // 如果有当前对话，先保存
        if (currentDialog && currentDialog.text.trim()) {
          dialogs.push({
            speaker: mapSpeakerName(currentDialog.speaker),
            text: currentDialog.text.trim()
          });
        }

        // 开始新的对话
        const speaker = line.substring(0, colonIndex).trim();
        const content = line.substring(colonIndex + 1).trim();
        currentDialog = {
          speaker: speaker,
          text: content
        };
      } else {
        // 如果有当前对话，追加到内容中
        if (currentDialog) {
          currentDialog.text += '\n' + line;
        } else {
          // 没有发言人标识，跳过这行或作为无名发言人处理
          console.warn('跳过无效行:', line);
        }
      }
    }

    // 保存最后一个对话
    if (currentDialog && currentDialog.text.trim()) {
      dialogs.push({
        speaker: mapSpeakerName(currentDialog.speaker),
        text: currentDialog.text.trim()
      });
    }

    return dialogs;
  };

  // 映射说话人名称
  const mapSpeakerName = (speakerName: string): string => {
    const name = speakerName.toLowerCase().trim();

    // 匹配常见的男性称呼
    if (name.includes('男') || name.includes('先生') || name.includes('大义') || 
        name.includes('male') || name.includes('man') || name.includes('boy') ||
        (name.includes('主持人') && name.includes('男'))) {
      return 'zh_male_dayi_v2_saturn_bigtts';
    }

    // 匹配常见的女性称呼
    if (name.includes('女') || name.includes('女士') || name.includes('米仔') || 
        name.includes('female') || name.includes('woman') || name.includes('girl') ||
        (name.includes('主持人') && name.includes('女'))) {
      return 'zh_female_mizai_v2_saturn_bigtts';
    }

    // 交替分配策略：如果无法确定性别，根据顺序交替分配
    const maleCount = dialogs.filter(dialog => 
      dialog.speaker === 'zh_male_dayi_v2_saturn_bigtts'
    ).length;
    const femaleCount = dialogs.filter(dialog => 
      dialog.speaker === 'zh_female_mizai_v2_saturn_bigtts'
    ).length;

    // 如果男性发言人更多，分配女性，反之分配男性，实现平衡
    if (maleCount > femaleCount) {
      return 'zh_female_mizai_v2_saturn_bigtts';
    } else {
      return 'zh_male_dayi_v2_saturn_bigtts';
    }
  };

  // 生成播客
  const generatePodcast = async () => {
    if (!appId || !accessKey) {
      alert('请填写 App ID 和 Access Key');
      return;
    }

    // 检查对话文本长度
    if (actionType === "0" && dialogs.length > 0) {
      const hasErrors = dialogErrors.some(error => error);
      if (hasErrors) {
        alert('请修正对话文本长度错误后再生成播客。单轮对话内容不能超过300个字符。');
        return;
      }
    }

    if (!inputText && !inputUrl && dialogs.length === 0) {
      alert('请至少提供一种输入内容（文本输入、URL输入或对话列表）');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setStatusMessage('准备开始生成播客...');
    setGeneratedAudioFile('');
    setGeneratedTextFile('');
    setPodcastTexts([]);

    try {
      const generator = new PodcastGenerator();
      
      const params: PodcastParams = {
        appId: appId,
        accessKey: accessKey,
        input_id: `podcast_${Date.now()}`,
        input_text: inputText,
        prompt_text: promptText,
        action: parseInt(actionType),
        speaker_info: {
          random_order: randomOrder
        },
        nlp_texts: dialogs.length > 0 ? dialogs.filter(d => d.text.trim()) : undefined,
        use_head_music: useHeadMusic,
        use_tail_music: useTailMusic,
        input_info: {
          input_url: inputUrl,
          return_audio_url: false,
          only_nlp_text: onlyNlpText
        },
        audio_config: {
          format: audioFormat,
          sample_rate: 24000,
          speech_rate: speechRate
        }
      };

      const progressCallback = (update: ProgressUpdate) => {
        setProgress(update.progress);
        setStatusMessage(update.message);
        
        if (update.status === 'completed') {
          if (update.audioFile) {
            setGeneratedAudioFile(update.audioFile);
          }
          if (update.audioData) {
            setGeneratedAudioData(update.audioData);
            // 在生产环境中使用data URL，在开发环境中使用blob URL
            try {
              // @ts-ignore - Tauri全局变量
              if (window.__TAURI__) {
                // Tauri环境，使用data URL更稳定
                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(update.audioData)));
                const audioUrl = `data:audio/${audioFormat};base64,${base64Audio}`;
                setGeneratedAudioUrl(audioUrl);
              } else {
                // 浏览器环境，使用blob URL
                const blob = new Blob([new Uint8Array(update.audioData)], { type: `audio/${audioFormat}` });
                const audioUrl = URL.createObjectURL(blob);
                setGeneratedAudioUrl(audioUrl);
              }
            } catch (error) {
              console.error('创建音频URL失败:', error);
              // 降级到blob URL
              const blob = new Blob([new Uint8Array(update.audioData)], { type: `audio/${audioFormat}` });
              const audioUrl = URL.createObjectURL(blob);
              setGeneratedAudioUrl(audioUrl);
            }
          }
          if (update.textFile) {
            setGeneratedTextFile(update.textFile);
          }
          if (update.podcastTexts) {
            setPodcastTexts(update.podcastTexts);
          }
        } else if (update.status === 'error') {
          alert(`播客生成失败: ${update.error || '未知错误'}`);
        }
      };

      await generator.generatePodcast(params, progressCallback);
      
    } catch (error) {
      console.error('播客生成失败:', error);
      alert(`播客生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 重置表单
  const resetForm = () => {
    setAppId("");
    setAccessKey("");
    // 清除本地存储的配置
    try {
      localStorage.removeItem('appId');
      localStorage.removeItem('accessKey');
    } catch (error) {
      console.error('清除配置失败:', error);
    }
    setInputText("");
    setInputUrl("");
    setPromptText("");
    setAudioFormat("mp3");
    setSpeechRate(0);
    setRandomOrder(true);
    setUseHeadMusic(true);
    setUseTailMusic(false);
    setOnlyNlpText(false);
    setDialogs([]);
    setDialogErrors([]);
    
    // 重置生成状态
    setIsGenerating(false);
    setProgress(0);
    setStatusMessage("");
    setGeneratedAudioFile("");
    setGeneratedAudioData(null);
    if (generatedAudioUrl) {
      URL.revokeObjectURL(generatedAudioUrl);
    }
    setGeneratedAudioUrl("");
    setGeneratedTextFile("");
    setPodcastTexts([]);
  };

  return (
    <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
              <i className="fas fa-microphone-alt text-white text-xl"></i>
            </div>
            <h1 className="text-xl font-bold text-gray-800 text-shadow">火山引擎播客生成工具</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-neutral hidden md:block">
              Tauri 桌面版本
            </div>
            <a 
              href="https://www.volcengine.com/docs/6561/1668014" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full flex items-center transition-custom"
            >
              <i className="fas fa-book-open mr-1 text-primary"></i>
              API文档
            </a>
          </div>
        </div>
      </header>

      {/* 主要内容区域 */}
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* 介绍卡片 */}
        <div className="bg-white rounded-xl p-6 shadow-soft mb-8 card-hover">
          <div className="flex items-start">
            <div className="flex-shrink-0 bg-blue-50 p-3 rounded-full">
              <i className="fas fa-info-circle text-primary"></i>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-semibold mb-2">工具介绍</h2>
              <p className="text-neutral">
                本工具通过Node.js后端服务调用火山引擎的播客生成API，解决了浏览器直接调用WebSocket时的跨域问题。
                您可以输入文本、链接或对话内容，配置相关参数后，即可生成高质量的播客音频。
                支持多种音频格式输出，适用于教育、娱乐、营销等多种场景。
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：配置面板 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-6 shadow-soft mb-8 card-hover">
              <h2 className="text-xl font-bold mb-6 flex items-center">
                <i className="fas fa-sliders-h text-primary mr-2"></i>
                播客配置
              </h2>
              
              {/* API凭证配置区域 */}
              <div className="bg-white rounded-xl shadow-lg p-6 mb-6 transition-all duration-300 hover:shadow-xl">
                <h3 className="text-xl font-bold text-dark mb-4 flex items-center">
                  <i className="fa fa-key text-primary mr-2"></i>
                  火山引擎 API 凭据
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="mb-4">
                    <label htmlFor="appId" className="block text-gray-700 font-medium mb-2">App ID</label>
                    <input 
                      type="text" 
                      value={appId}
                      onChange={(e) => handleAppIdChange(e.target.value)}
                      id="appId" 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all" 
                      placeholder="请输入您的App ID"
                    />
                    <p className="text-xs text-gray-500 mt-1">在火山引擎控制台-密钥管理中获取</p>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="accessKey" className="block text-gray-700 font-medium mb-2">Access Key</label>
                    <input 
                      type="password" 
                      value={accessKey}
                      onChange={(e) => handleAccessKeyChange(e.target.value)}
                      id="accessKey" 
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all" 
                      placeholder="请输入您的Access Key"
                    />
                    <p className="text-xs text-gray-500 mt-1">请妥善保管您的密钥，不要泄露给他人</p>
                  </div>
                </div>
                <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <i className="fa fa-info-circle text-blue-500"></i>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-700">
                        请确保您已开通火山引擎的语音合成服务，并且您的账户有足够的余额。
                        <a href="https://console.volcengine.com/console" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">前往火山引擎控制台</a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 生成类型选择 */}
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3 text-gray-700">生成类型</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="inline-flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-custom">
                    <input 
                      type="radio" 
                      name="actionType" 
                      value="0" 
                      checked={actionType === "0"}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary" 
                    />
                    <span className="ml-2 text-sm font-medium">文本分析生成</span>
                  </label>
                  <label className="inline-flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-custom">
                    <input 
                      type="radio" 
                      name="actionType" 
                      value="3" 
                      checked={actionType === "3"}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="ml-2 text-sm font-medium">对话文本生成</span>
                  </label>
                  <label className="inline-flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-custom">
                    <input 
                      type="radio" 
                      name="actionType" 
                      value="4" 
                      checked={actionType === "4"}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="ml-2 text-sm font-medium">提示词扩展生成</span>
                  </label>
                </div>
              </div>

              {/* 输入内容区域 */}
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3 text-gray-700">输入内容</h3>
                
                {/* 文本分析生成输入框 */}
                {actionType === "0" && (
                  <div className="mb-4">
                    <label htmlFor="inputText" className="block text-sm font-medium text-gray-700 mb-1">播客主题文本</label>
                    <textarea 
                      id="inputText" 
                      rows={4}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition-custom" 
                      placeholder="请输入您想要分析的播客主题文本..."
                    />
                  </div>
                )}
                
                {/* 网页链接输入框 */}
                {actionType === "0" && (
                  <div className="mb-4">
                    <label htmlFor="inputUrl" className="block text-sm font-medium text-gray-700 mb-1">或者输入网页链接</label>
                    <input 
                      type="url" 
                      id="inputUrl" 
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition-custom" 
                      placeholder="https://example.com"
                    />
                    <p className="text-xs text-neutral mt-1">支持网页、PDF、DOC、TXT等文件链接</p>
                  </div>
                )}
                
                {/* 对话文本生成输入框 */}
                {actionType === "3" && (
                  <div className="mb-4">
                    {/* 文件上传区域 */}
                    <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                      <div className="text-center">
                        <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-2"></i>
                        <div className="mb-2">
                          <button 
                            onClick={handleFileUpload}
                            className="cursor-pointer bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium transition-custom inline-flex items-center"
                          >
                            <i className="fas fa-file-upload mr-2"></i>
                            上传对话文档
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">
                          支持 .txt, .doc, .docx 格式<br />
                          格式：每行一轮对话，使用":"分隔发言人和内容，轮次间用空行分隔
                        </p>
                        {/* 文件上传状态显示 */}
                        {fileUploadStatus.show && (
                          <div className={`mt-2 text-sm ${
                            fileUploadStatus.type === 'success' ? 'text-green-600' :
                            fileUploadStatus.type === 'error' ? 'text-red-600' : 'text-blue-600'
                          }`}>
                            {fileUploadStatus.message}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* 对话列表 */}
                    <div className="space-y-4">
                      {dialogs.map((dialog, index) => (
                        <div key={index} className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                          <div className="flex items-center mb-2">
                            <div className="relative">
                              <select 
                                className="w-36 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200 appearance-none cursor-pointer"
                                value={dialog.speaker}
                                onChange={(e) => updateDialog(index, "speaker", e.target.value)}
                              >
                                <option value="zh_male_dayi_v2_saturn_bigtts">男生 - 大义</option>
                                <option value="zh_female_mizai_v2_saturn_bigtts">女生 - 米仔</option>
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                <i className="fas fa-chevron-down text-gray-400 text-xs"></i>
                              </div>
                            </div>
                            <span className="mx-2 text-gray-400">:</span>
                            <div className="flex-1">
                              <textarea 
                                rows={2} 
                                className={`w-full px-3 py-1 border rounded-md text-sm transition-all ${
                                  dialogErrors[index] 
                                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' 
                                    : 'border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20'
                                }`}
                                placeholder="请输入对话内容..."
                                value={dialog.text}
                                onChange={(e) => updateDialog(index, "text", e.target.value)}
                              />
                              {dialogErrors[index] && (
                                <p className="mt-1 text-xs text-red-500">
                                  <i className="fas fa-exclamation-circle mr-1"></i>
                                  对话内容不能超过300个字符，当前{dialog.text.length}个字符
                                </p>
                              )}
                            </div>
                            {index > 0 && (
                              <button 
                                className="ml-2 text-gray-400 hover:text-danger"
                                onClick={() => removeDialog(index)}
                              >
                                <i className="fas fa-times"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* 控制按钮 */}
                    <div className="mt-4 flex space-x-2">
                      <button 
                        onClick={addDialog}
                        className="text-primary text-sm flex items-center hover:text-primary/80 transition-custom"
                      >
                        <i className="fas fa-plus-circle mr-1"></i>
                        添加对话轮次
                      </button>
                      <button 
                        onClick={clearDialogs}
                        className="text-gray-500 text-sm flex items-center hover:text-gray-700 transition-custom"
                      >
                        <i className="fas fa-trash mr-1"></i>
                        清空所有对话
                      </button>
                    </div>
                  </div>
                )}
                
                {/* 提示词扩展生成输入框 */}
                {actionType === "4" && (
                  <div className="mb-4">
                    <label htmlFor="promptText" className="block text-sm font-medium text-gray-700 mb-1">提示词</label>
                    <input 
                      type="text" 
                      id="promptText" 
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary transition-custom" 
                      placeholder="例如：火山引擎，怎么平衡工作和生活？"
                    />
                  </div>
                )}
              </div>

              {/* 音频配置 */}
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3 text-gray-700">音频配置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="audioFormat" className="block text-sm font-medium text-gray-700 mb-1">音频格式</label>
                    <div className="relative">
                      <select 
                        id="audioFormat" 
                        value={audioFormat}
                        onChange={(e) => setAudioFormat(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200 appearance-none cursor-pointer"
                      >
                        <option value="mp3" className="font-medium">MP3 (推荐)</option>
                        <option value="ogg_opus" className="font-medium">OGG OPUS</option>
                        <option value="pcm" className="font-medium">PCM</option>
                        <option value="aac" className="font-medium">AAC</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
                        <i className="fas fa-chevron-down text-gray-400"></i>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="speechRate" className="block text-sm font-medium text-gray-700 mb-1">
                      语速 (当前: {speechRate})
                    </label>
                    <input 
                      type="range" 
                      id="speechRate" 
                      min="-50" 
                      max="100" 
                      value={speechRate}
                      onChange={(e) => setSpeechRate(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-xs text-neutral mt-1">
                      <span>慢</span>
                      <span>正常</span>
                      <span>快</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 其他设置 */}
              <div className="mb-6">
                <h3 className="text-md font-semibold mb-3 text-gray-700">其他设置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="inline-flex items-center">
                      <input 
                        type="checkbox" 
                        checked={randomOrder}
                        onChange={(e) => setRandomOrder(e.target.checked)}
                        className="w-4 h-4 text-primary focus:ring-primary" 
                      />
                      <span className="ml-2 text-sm text-gray-700">随机对话顺序</span>
                    </label>
                  </div>
                  <div>
                    <label className="inline-flex items-center">
                      <input 
                        type="checkbox" 
                        checked={useHeadMusic}
                        onChange={(e) => setUseHeadMusic(e.target.checked)}
                        className="w-4 h-4 text-primary focus:ring-primary" 
                      />
                      <span className="ml-2 text-sm text-gray-700">添加片头音乐</span>
                    </label>
                  </div>
                  <div>
                    <label className="inline-flex items-center">
                      <input 
                        type="checkbox" 
                        checked={useTailMusic}
                        onChange={(e) => setUseTailMusic(e.target.checked)}
                        className="w-4 h-4 text-primary focus:ring-primary"
                      />
                      <span className="ml-2 text-sm text-gray-700">添加片尾音乐</span>
                    </label>
                  </div>
                  <div>
                    <label className="inline-flex items-center">
                      <input 
                        type="checkbox" 
                        checked={onlyNlpText}
                        onChange={(e) => setOnlyNlpText(e.target.checked)}
                        className="w-4 h-4 text-primary focus:ring-primary"
                      />
                      <span className="ml-2 text-sm text-gray-700">仅生成文本内容</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 生成按钮 */}
              <div className="flex space-x-4">
                <button 
                  onClick={generatePodcast}
                  disabled={isGenerating}
                  className={`flex-1 ${
                    isGenerating 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary/90'
                  } text-white py-3 px-6 rounded-lg font-medium transition-custom flex items-center justify-center`}
                >
                  {isGenerating ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      生成中...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magic mr-2"></i>
                      生成播客
                    </>
                  )}
                </button>
                <button 
                  onClick={resetForm}
                  disabled={isGenerating}
                  className={`${
                    isGenerating 
                      ? 'bg-gray-100 cursor-not-allowed' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  } text-gray-700 py-3 px-6 rounded-lg font-medium transition-custom`}
                >
                  重置
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：结果和状态区域 */}
          <div className="lg:col-span-1">
            {/* 状态卡片 */}
            <div className="bg-white rounded-xl p-6 shadow-soft mb-8 card-hover">
              <h2 className="text-xl font-bold mb-4 flex items-center">
                <i className="fas fa-tachometer-alt text-primary mr-2"></i>
                生成状态
              </h2>
              <div className="space-y-4">
                {isGenerating ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">进度</span>
                        <span className="text-primary font-medium">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm flex items-center">
                      <i className="fas fa-spinner fa-spin mr-2 text-primary"></i>
                      {statusMessage}
                    </p>
                  </>
                ) : (
                  <p className="text-neutral">
                    {generatedAudioFile ? '播客生成完成！' : '等待生成播客...'}
                  </p>
                )}
              </div>
            </div>

            {/* 音频播放器 */}
            {generatedAudioUrl && (
              <div className="bg-white rounded-xl p-6 shadow-soft mb-8 card-hover">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                  <i className="fas fa-play text-primary mr-2"></i>
                  播客音频
                </h2>
                <div className="space-y-4">
                  <audio controls className="w-full">
                    <source src={generatedAudioUrl} type={`audio/${audioFormat}`} />
                    您的浏览器不支持音频播放。
                  </audio>
                  <div className="text-sm text-gray-600">
                    <p>文件名: {generatedAudioFile}</p>
                    <p>格式: {audioFormat.toUpperCase()}</p>
                  </div>
                  <button 
                    className="w-full bg-secondary hover:bg-secondary/90 text-white py-2 px-4 rounded-lg transition-custom flex items-center justify-center"
                    onClick={async () => {
                      if (generatedAudioData && generatedAudioFile) {
                        try {
                          // 使用 Tauri 对话框让用户选择保存位置
                          const filePath = await save({
                            defaultPath: generatedAudioFile,
                            filters: [{
                              name: 'Audio',
                              extensions: [audioFormat]
                            }]
                          });

                          if (filePath) {
                            // 将音频数据写入用户选择的位置
                            await writeFile(filePath, generatedAudioData);
                            alert(`音频文件已保存到: ${filePath}`);
                          }
                        } catch (error) {
                          console.error('保存文件失败:', error);
                          alert(`保存文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
                        }
                      }
                    }}
                  >
                    <i className="fas fa-download mr-2"></i>
                    下载音频文件
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 播客文本结果区域 */}
        {podcastTexts.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-soft mb-8 card-hover">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              <i className="fas fa-align-left text-primary mr-2"></i>
              播客文本内容
            </h2>
            <div className="space-y-3">
              {podcastTexts.map((item, index) => (
                <div key={index} className="border-l-4 border-primary pl-4 py-2">
                  <div className="text-sm text-gray-500 mb-1">说话人: {item.speaker}</div>
                  <div className="text-gray-800">{item.text}</div>
                </div>
              ))}
            </div>
            {generatedTextFile && (
              <div className="mt-4 pt-4 border-t">
                <button 
                  className="w-full bg-neutral hover:bg-neutral/90 text-white py-2 px-4 rounded-lg transition-custom flex items-center justify-center"
                  onClick={async () => {
                    if (podcastTexts.length > 0 && generatedTextFile) {
                      try {
                        // 使用 Tauri 对话框让用户选择保存位置
                        const filePath = await save({
                          defaultPath: generatedTextFile,
                          filters: [{
                            name: 'JSON',
                            extensions: ['json']
                          }]
                        });

                        if (filePath) {
                          // 将文本数据写入用户选择的位置
                          const textContent = JSON.stringify(podcastTexts, null, 2);
                          await writeFile(filePath, new TextEncoder().encode(textContent));
                          alert(`文本文件已保存到: ${filePath}`);
                        }
                      } catch (error) {
                        console.error('保存文件失败:', error);
                        alert(`保存文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
                      }
                    }
                  }}
                >
                  <i className="fas fa-download mr-2"></i>
                  下载文本文件
                </button>
              </div>
            )}
          </div>
        )}
      </main>

    </div>
  );
}

export default App;
