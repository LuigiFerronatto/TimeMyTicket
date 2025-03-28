// Arquivo background.js - Gerencia eventos em segundo plano e exportação

chrome.runtime.onInstalled.addListener(() => {
  console.log('HubSpot Ticket Timer instalado com sucesso');
  
  // Inicializar o armazenamento se for necessário
  chrome.storage.local.get(['ticketTimers', 'activeTicket'], (result) => {
    if (!result.ticketTimers) {
      chrome.storage.local.set({
        ticketTimers: {},  // Armazenará os tempos de cada ticket
        activeTicket: null, // Armazenará o ticket atualmente ativo
        timerStartTime: null // Timestamp de início do timer atual
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
});

// Tratar cliques no menu de contexto
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "exportTimersReport") {
    // Enviar mensagem para o script de conteúdo para gerar relatório
    chrome.tabs.sendMessage(tab.id, { action: "exportTimerReport" });
  }
});

// Escuta mensagens dos scripts de conteúdo e do popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTimerData') {
    chrome.storage.local.get(['ticketTimers', 'activeTicket', 'timerStartTime'], (data) => {
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
  
  // Resetar o timer de um ticket específico
  if (request.action === 'resetTicketTimer') {
    chrome.storage.local.get(['ticketTimers', 'activeTicket'], (data) => {
      const ticketTimers = data.ticketTimers || {};
      
      // Se o ticket a ser resetado está ativo, desativa-o
      if (data.activeTicket === request.ticketId) {
        chrome.storage.local.set({ 
          activeTicket: null,
          timerStartTime: null
        });
      }
      
      // Reseta o tempo do ticket
      delete ticketTimers[request.ticketId];
      
      chrome.storage.local.set({ ticketTimers }, () => {
        sendResponse({ success: true });
      });
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
    const fileName = `hubspot-tickets-tempo-${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.csv`;
    
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
  
  // Obter informações de um ticket específico - repassar para o content script
  if (request.action === 'getTicketInfo') {
    if (sender.tab) {
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'getTicketInfo',
        ticketId: request.ticketId
      }, (response) => {
        sendResponse(response);
      });
      return true;
    }
  }
});

// Quando uma aba é fechada, verificar se há um timer ativo e pausá-lo
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.storage.local.get(['activeTicket', 'timerStartTime', 'ticketTimers'], (data) => {
    if (data.activeTicket && data.timerStartTime) {
      // Calcular o tempo decorrido
      const startTime = new Date(data.timerStartTime);
      const elapsedTime = Math.floor((new Date() - startTime) / 1000);
      
      // Adicionar o tempo decorrido ao total do ticket
      const ticketTimers = data.ticketTimers || {};
      ticketTimers[data.activeTicket] = (ticketTimers[data.activeTicket] || 0) + elapsedTime;
      
      // Atualizar o storage
      chrome.storage.local.set({
        activeTicket: null,
        timerStartTime: null,
        ticketTimers: ticketTimers
      });
      
      console.log(`Timer pausado automaticamente para o ticket ${data.activeTicket} devido ao fechamento da aba.`);
    }
  });
});