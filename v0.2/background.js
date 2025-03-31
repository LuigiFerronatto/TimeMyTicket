// background.js - Script de background melhorado com suporte a rastreamento de fases

chrome.runtime.onInstalled.addListener(() => {
  console.log('TimeMyTicket instalado com sucesso');
  
  // Inicializar o armazenamento se for necessário
  chrome.storage.local.get([
    'ticketTimers', 
    'activeTicket', 
    'phaseTimers', 
    'currentPhases',
    'lastPhaseChange'
  ], (result) => {
    if (!result.ticketTimers) {
      chrome.storage.local.set({
        ticketTimers: {},  // Tempo total por ticket
        activeTicket: null, // Ticket atualmente ativo
        timerStartTime: null, // Timestamp de início do timer atual
        ticketTitles: {}, // Títulos dos tickets
        
        // Novos campos para rastreamento de fase
        phaseTimers: {}, // Tempo por fase por ticket {ticketId: {fase1: seconds, fase2: seconds}}
        currentPhases: {}, // Fase atual de cada ticket
        lastPhaseChange: {} // Timestamp da última mudança de fase
      });
    }
  });
  
  // Adicionar opção ao menu de contexto para exportar relatório
  chrome.contextMenus.create({
    id: "exportTimersReport",
    title: "Exportar relatório de tempo de tickets",
    contexts: ["page"],
    documentUrlPatterns: ["https://*.hubspot.com/*"]
  });

  // Adicionar opção ao menu de contexto para resetar todos os timers
  chrome.contextMenus.create({
    id: "resetAllTimers",
    title: "Resetar todos os timers",
    contexts: ["page"],
    documentUrlPatterns: ["https://*.hubspot.com/*"]
  });
});

// Tratar cliques no menu de contexto
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "exportTimersReport") {
    // Enviar mensagem para o script de conteúdo para gerar relatório
    chrome.tabs.sendMessage(tab.id, { action: "exportTimerReport" });
  }
  
  if (info.menuItemId === "resetAllTimers") {
    if (confirm('Tem certeza que deseja resetar todos os timers? Esta ação não pode ser desfeita.')) {
      // Limpar todos os timers e dados de fase
      chrome.storage.local.set({
        ticketTimers: {},
        activeTicket: null,
        timerStartTime: null,
        phaseTimers: {},
        currentPhases: {},
        lastPhaseChange: {}
      }, () => {
        // Notificar o usuário
        chrome.tabs.sendMessage(tab.id, { 
          action: "showToast", 
          message: "Todos os timers foram resetados", 
          type: "success" 
        });
      });
    }
  }
});

// Escuta mensagens dos scripts de conteúdo e do popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Obter dados do timer
  if (request.action === 'getTimerData') {
    chrome.storage.local.get([
      'ticketTimers', 
      'activeTicket', 
      'timerStartTime', 
      'ticketTitles',
      'phaseTimers',
      'currentPhases',
      'lastPhaseChange'
    ], (data) => {
      sendResponse(data);
    });
    return true; // Indica que a resposta será assíncrona
  }
  
  // Adicionar ou atualizar o tempo de um ticket específico
  if (request.action === 'updateTicketTime') {
    chrome.storage.local.get(['ticketTimers'], (data) => {
      const ticketTimers = data.ticketTimers || {};
      ticketTimers[request.ticketId] = request.seconds;
      
      chrome.storage.local.set({ ticketTimers }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
  
  // Adicionar tempo a uma fase específica
  if (request.action === 'addTimeToPhase') {
    chrome.storage.local.get(['phaseTimers', 'ticketTimers'], (data) => {
      const phaseTimers = data.phaseTimers || {};
      const ticketTimers = data.ticketTimers || {};
      
      // Inicializar se necessário
      if (!phaseTimers[request.ticketId]) {
        phaseTimers[request.ticketId] = {};
      }
      
      // Adicionar tempo à fase
      phaseTimers[request.ticketId][request.phase] = 
        (phaseTimers[request.ticketId][request.phase] || 0) + request.seconds;
      
      // Adicionar ao tempo total do ticket
      ticketTimers[request.ticketId] = 
        (ticketTimers[request.ticketId] || 0) + request.seconds;
      
      // Atualizar storage
      chrome.storage.local.set({ 
        phaseTimers: phaseTimers,
        ticketTimers: ticketTimers 
      }, () => {
        sendResponse({ success: true });
        
        // Notificar outras abas para atualizar
        chrome.runtime.sendMessage({ action: 'syncData' });
      });
    });
    return true;
  }
  
  // Atualizar fase atual de um ticket
  if (request.action === 'updateTicketPhase') {
    chrome.storage.local.get(['currentPhases', 'lastPhaseChange', 'phaseTimers'], (data) => {
      const currentPhases = data.currentPhases || {};
      const lastPhaseChange = data.lastPhaseChange || {};
      const phaseTimers = data.phaseTimers || {};
      const now = new Date();
      
      // Se o ticket já tinha uma fase e timestamp
      if (currentPhases[request.ticketId] && lastPhaseChange[request.ticketId]) {
        const oldPhase = currentPhases[request.ticketId];
        const previousStartTime = new Date(lastPhaseChange[request.ticketId]);
        const timeInPreviousPhase = Math.floor((now - previousStartTime) / 1000);
        
        // Inicializar a estrutura se necessário
        if (!phaseTimers[request.ticketId]) {
          phaseTimers[request.ticketId] = {};
        }
        
        // Acumular o tempo na fase anterior
        phaseTimers[request.ticketId][oldPhase] = 
          (phaseTimers[request.ticketId][oldPhase] || 0) + timeInPreviousPhase;
      }
      
      // Atualizar fase atual e timestamp
      currentPhases[request.ticketId] = request.phase;
      lastPhaseChange[request.ticketId] = now.toISOString();
      
      // Atualizar storage
      chrome.storage.local.set({ 
        currentPhases: currentPhases,
        lastPhaseChange: lastPhaseChange,
        phaseTimers: phaseTimers
      }, () => {
        sendResponse({ success: true });
        
        // Notificar outras abas para atualizar
        chrome.runtime.sendMessage({ action: 'syncData' });
      });
    });
    return true;
  }
  
  // Resetar o timer de um ticket específico
  if (request.action === 'resetTicketTimer') {
    chrome.storage.local.get([
      'ticketTimers', 
      'activeTicket',
      'phaseTimers',
      'currentPhases',
      'lastPhaseChange'
    ], (data) => {
      const ticketTimers = data.ticketTimers || {};
      const phaseTimers = data.phaseTimers || {};
      const currentPhases = data.currentPhases || {};
      const lastPhaseChange = data.lastPhaseChange || {};
      
      // Se o ticket a ser resetado está ativo, desativa-o
      if (data.activeTicket === request.ticketId) {
        chrome.storage.local.set({ 
          activeTicket: null,
          timerStartTime: null
        });
      }
      
      // Resetar o tempo do ticket
      delete ticketTimers[request.ticketId];
      
      // Resetar os dados de fase
      delete phaseTimers[request.ticketId];
      
      // Resetar fase atual mas manter o ticket na lista
      if (currentPhases[request.ticketId]) {
        lastPhaseChange[request.ticketId] = new Date().toISOString();
      }
      
      chrome.storage.local.set({ 
        ticketTimers: ticketTimers,
        phaseTimers: phaseTimers,
        currentPhases: currentPhases,
        lastPhaseChange: lastPhaseChange
      }, () => {
        sendResponse({ success: true });
        
        // Notificar outras abas para atualizar
        chrome.runtime.sendMessage({ action: 'syncData' });
      });
    });
    return true;
  }
  
  // Pausar o timer ativo
  if (request.action === 'pauseTimer') {
    chrome.storage.local.get([
      'ticketTimers', 
      'activeTicket', 
      'timerStartTime',
      'phaseTimers',
      'currentPhases'
    ], (data) => {
      if (data.activeTicket && data.timerStartTime) {
        // Calcular o tempo decorrido
        const startTime = new Date(data.timerStartTime);
        const elapsedTime = Math.floor((new Date() - startTime) / 1000);
        
        // Adicionar o tempo decorrido ao total do ticket
        const ticketTimers = data.ticketTimers || {};
        ticketTimers[data.activeTicket] = (ticketTimers[data.activeTicket] || 0) + elapsedTime;
        
        // Adicionar o tempo à fase atual, se houver
        const phaseTimers = data.phaseTimers || {};
        const currentPhases = data.currentPhases || {};
        const currentPhase = currentPhases[data.activeTicket];
        
        if (currentPhase) {
          // Inicializar estrutura se necessário
          if (!phaseTimers[data.activeTicket]) {
            phaseTimers[data.activeTicket] = {};
          }
          
          // Adicionar tempo à fase atual
          phaseTimers[data.activeTicket][currentPhase] = 
            (phaseTimers[data.activeTicket][currentPhase] || 0) + elapsedTime;
        }
        
        // Atualizar o storage
        chrome.storage.local.set({
          activeTicket: null,
          timerStartTime: null,
          ticketTimers: ticketTimers,
          phaseTimers: phaseTimers
        }, () => {
          sendResponse({ success: true });
          
          // Notificar outras abas para atualizar
          chrome.runtime.sendMessage({ action: 'syncData' });
        });
      } else {
        sendResponse({ success: false, error: "Nenhum timer ativo" });
      }
    });
    return true;
  }
  
  // Salvar relatório como CSV
  if (request.action === 'saveReportData') {
    // Criar um objeto URL para o blob
    const blob = new Blob([request.csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Criar um nome de arquivo com data atual
    const date = new Date();
    const fileName = `timeMyTicket-${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.csv`;
    
    // Fazer download do arquivo
    chrome.downloads.download({
      url: url,
      filename: fileName,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Erro ao fazer download:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
      } else {
        sendResponse({ success: true, downloadId: downloadId });
      }
    });
    
    return true;
  }
  
  // Mostrar toast de notificação (adicionado para mensagens do popup)
  if (request.action === 'showToast') {
    if (sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'showToast',
        message: request.message,
        type: request.type || 'info'
      });
    }
    return false;
  }
  
  // Sincronizar dados entre abas
  if (request.action === 'syncData') {
    // Notificar todas as abas abertas para atualizar seus dados
    chrome.tabs.query({url: "https://*.hubspot.com/*"}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id !== sender.tab?.id) {
          chrome.tabs.sendMessage(tab.id, { action: "refreshTimers" });
        }
      }
    });
    return false;
  }
});

// Quando uma aba é fechada, verificar se há um timer ativo e pausá-lo
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.storage.local.get([
    'activeTicket', 
    'timerStartTime', 
    'ticketTimers',
    'phaseTimers',
    'currentPhases'
  ], (data) => {
    if (data.activeTicket && data.timerStartTime) {
      // Calcular o tempo decorrido
      const startTime = new Date(data.timerStartTime);
      const elapsedTime = Math.floor((new Date() - startTime) / 1000);
      
      // Adicionar o tempo decorrido ao total do ticket
      const ticketTimers = data.ticketTimers || {};
      ticketTimers[data.activeTicket] = (ticketTimers[data.activeTicket] || 0) + elapsedTime;
      
      // Adicionar o tempo à fase atual, se houver
      const phaseTimers = data.phaseTimers || {};
      const currentPhases = data.currentPhases || {};
      const currentPhase = currentPhases[data.activeTicket];
      
      if (currentPhase) {
        // Inicializar estrutura se necessário
        if (!phaseTimers[data.activeTicket]) {
          phaseTimers[data.activeTicket] = {};
        }
        
        // Adicionar tempo à fase atual
        phaseTimers[data.activeTicket][currentPhase] = 
          (phaseTimers[data.activeTicket][currentPhase] || 0) + elapsedTime;
      }
      
      // Atualizar o storage
      chrome.storage.local.set({
        activeTicket: null,
        timerStartTime: null,
        ticketTimers: ticketTimers,
        phaseTimers: phaseTimers
      });
      
      console.log(`Timer pausado automaticamente para o ticket ${data.activeTicket} devido ao fechamento da aba.`);
    }
  });
});