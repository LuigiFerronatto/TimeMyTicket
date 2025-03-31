// Arquivo popup.js - Script para a interface do popup da extensão (com segundos)

document.addEventListener('DOMContentLoaded', async () => {
  const activeTimerInfo = document.getElementById('active-timer-info');
  const timerList = document.getElementById('timer-list');
  const exportBtn = document.getElementById('export-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');
  
  // Carregar dados dos timers
  loadTimerData();
  
  // Configurar eventos de botões
  exportBtn.addEventListener('click', exportTimerData);
  resetAllBtn.addEventListener('click', confirmResetAll);
  
  // Função para carregar e exibir os dados dos timers
  async function loadTimerData() {
    try {
      // Obter dados do armazenamento
      const data = await chrome.storage.local.get(['ticketTimers', 'activeTicket', 'timerStartTime', 'ticketTitles']);
      const { ticketTimers = {}, activeTicket, timerStartTime, ticketTitles = {} } = data;
      
      // Exibir informação do timer ativo
      if (activeTicket && timerStartTime) {
        const startTime = new Date(timerStartTime);
        const elapsedSeconds = Math.floor((new Date() - startTime) / 1000);
        const totalSeconds = (ticketTimers[activeTicket] || 0) + elapsedSeconds;
        
        // Obter informações do ticket da aba atual
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {action: "getTicketInfo", ticketId: activeTicket}, function(response) {
            let ticketInfo = response && response.ticketInfo 
              ? response.ticketInfo 
              : { 
                  title: ticketTitles[activeTicket] || `Ticket #${activeTicket}`, 
                  owner: 'Desconhecido',
                  cda: 'Não informado'
                };
            
            activeTimerInfo.innerHTML = `
              <div class="timer-info">
                <div class="ticket-title">${ticketInfo.title}</div>
                <div class="ticket-id">${activeTicket}</div>
              </div>
              <div class="timer-info">
                <div class="timer-label">Proprietário: ${ticketInfo.owner}</div>
                <div class="timer-label">CDA: ${ticketInfo.cda}</div>
              </div>
              <div class="timer-info">
                <div class="timer-label">Tempo atual</div>
                <div class="timer-value">${formatTimeWithSeconds(totalSeconds)}</div>
              </div>
              <div class="timer-info">
                <div class="timer-label">Iniciado em</div>
                <div>${formatDate(startTime)}</div>
              </div>
            `;
            
            // Iniciar um atualizador para o timer ativo no popup
            startActiveTimerUpdater(ticketTimers[activeTicket] || 0, startTime);
          });
        });
      } else {
        activeTimerInfo.innerHTML = `
          <div class="timer-info">
            Nenhum timer ativo no momento.
          </div>
        `;
      }
      
      // Exibir lista de timers
      if (Object.keys(ticketTimers).length === 0) {
        timerList.innerHTML = '<div class="empty-state">Nenhum ticket monitorado ainda.</div>';
      } else {
        // Ordenar tickets por tempo (decrescente)
        const sortedTickets = Object.entries(ticketTimers)
          .sort(([, timeA], [, timeB]) => timeB - timeA);
        
        timerList.innerHTML = '';
        
        // Para cada ticket, obter informações adicionais e criar elemento na lista
        let processedCount = 0;
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          sortedTickets.forEach(([ticketId, seconds]) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "getTicketInfo", ticketId: ticketId}, function(response) {
              let ticketInfo = response && response.ticketInfo 
                ? response.ticketInfo 
                : { 
                    title: ticketTitles[ticketId] || `Ticket #${ticketId}`, 
                    owner: 'Desconhecido',
                    cda: 'Não informado',
                    status: 'Desconhecido'
                  };
              
              const isActive = ticketId === activeTicket;
              
              // Calcular tempo total (incluindo ativo)
              let totalSeconds = seconds;
              if (isActive && timerStartTime) {
                const elapsedSeconds = Math.floor((new Date() - new Date(timerStartTime)) / 1000);
                totalSeconds += elapsedSeconds;
              }
              
              const itemEl = document.createElement('div');
              itemEl.className = `timer-item ${isActive ? 'active' : ''}`;
              
              itemEl.innerHTML = `
                <div class="timer-details">
                  <div class="ticket-title">${ticketInfo.title}</div>
                  <div class="ticket-id">${ticketId}</div>
                  <div class="ticket-owner">Prop: ${ticketInfo.owner} | CDA: ${ticketInfo.cda}</div>
                  <div class="ticket-status">Status: ${ticketInfo.status}</div>
                </div>
                <div class="timer-value-display">${formatTimeWithSeconds(totalSeconds)}</div>
              `;
              
              // Adicionar identificador para atualização contínua se for o timer ativo
              if (isActive) {
                itemEl.querySelector('.timer-value-display').id = `active-timer-${ticketId}`;
              }
              
              // Adicionar evento para resetar timer individualmente com clique direito
              itemEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                confirmResetTimer(ticketId, ticketInfo.title);
              });
              
              timerList.appendChild(itemEl);
              
              // Verificar se todos os tickets foram processados
              processedCount++;
              if (processedCount === sortedTickets.length) {
                // Remover mensagem de carregamento se existir
                const loadingEl = timerList.querySelector('.loading');
                if (loadingEl) {
                  loadingEl.remove();
                }
              }
            });
          });
        });
        
        // Mostrar mensagem de carregamento enquanto processa
        if (sortedTickets.length > 0) {
          const loadingEl = document.createElement('div');
          loadingEl.className = 'loading';
          loadingEl.textContent = 'Carregando informações...';
          timerList.appendChild(loadingEl);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados dos timers:', error);
      timerList.innerHTML = '<div class="empty-state">Erro ao carregar dados.</div>';
    }
  }
  
  // Função para iniciar o atualizador do timer ativo no popup
  function startActiveTimerUpdater(baseSeconds, startTime) {
    let updaterInterval = setInterval(() => {
      // Verificar se ainda estamos no popup
      if (!document.getElementById('active-timer-info')) {
        clearInterval(updaterInterval);
        return;
      }
      
      // Calcular o tempo atual
      const elapsedSeconds = Math.floor((new Date() - startTime) / 1000);
      const totalSeconds = baseSeconds + elapsedSeconds;
      
      // Atualizar os displays de tempo
      const timerValueEl = document.querySelector('.timer-value');
      if (timerValueEl) {
        timerValueEl.textContent = formatTimeWithSeconds(totalSeconds);
      }
      
      // Atualizar também na lista de tickets
      const activeTicket = document.getElementById(`active-timer-${startTime}`);
      if (activeTicket) {
        activeTicket.textContent = formatTimeWithSeconds(totalSeconds);
      }
    }, 1000);
  }
  
  // Função para exportar os dados dos timers como CSV
  async function exportTimerData() {
    try {
      // Enviar comando para exportar relatório
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "exportTimerReport"}, function(response) {
          if (response && response.success) {
            showSuccessMessage('Relatório exportado com sucesso!');
          }
        });
      });
    } catch (error) {
      console.error('Erro ao exportar dados:', error);
      showSuccessMessage('Erro ao exportar relatório!', true);
    }
  }
  
  // Função para confirmar reset de todos os timers
  function confirmResetAll() {
    if (confirm('Tem certeza que deseja resetar todos os timers? Esta ação não pode ser desfeita.')) {
      chrome.storage.local.set({
        ticketTimers: {},
        activeTicket: null,
        timerStartTime: null
      }, () => {
        loadTimerData();
        showSuccessMessage('Todos os timers foram resetados!');
      });
    }
  }
  
  // Função para confirmar reset de um timer específico
  function confirmResetTimer(ticketId, ticketTitle) {
    const displayTitle = ticketTitle || `Ticket #${ticketId}`;
    if (confirm(`Tem certeza que deseja resetar o timer de "${displayTitle}"? Esta ação não pode ser desfeita.`)) {
      chrome.runtime.sendMessage({
        action: 'resetTicketTimer',
        ticketId: ticketId
      }, (response) => {
        if (response && response.success) {
          loadTimerData();
          showSuccessMessage(`Timer resetado com sucesso!`);
        }
      });
    }
  }
  
  // Função para mostrar mensagem de sucesso
  function showSuccessMessage(message, isError = false) {
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    if (isError) {
      successMsg.style.backgroundColor = '#ff5c35';
    }
    successMsg.textContent = message;
    
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 3000);
  }
  
  // Utilidades para formatação
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  function formatTimeWithSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  function formatDate(date) {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
});