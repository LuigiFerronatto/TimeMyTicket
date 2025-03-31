// popup.js - Script para a interface do popup da extensão (melhorado com interatividade)

document.addEventListener('DOMContentLoaded', async () => {
    // Elementos do DOM
    const activeTimerInfo = document.getElementById('active-timer-info');
    const timerList = document.getElementById('timer-list');
    const exportBtn = document.getElementById('export-btn');
    const resetAllBtn = document.getElementById('reset-all-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const contextMenu = document.getElementById('context-menu');
    const resetTimerOption = document.getElementById('reset-timer');
    const copyTimeOption = document.getElementById('copy-time');
    const goToTicketOption = document.getElementById('go-to-ticket');
    
    // Estado atual do contexto
    let currentContextTicketId = null;
    let currentContextTicketTime = null;
    let currentContextTicketInfo = null;
    
    // Carregar dados dos timers
    loadTimerData();
    
    // Configurar eventos de botões
    exportBtn.addEventListener('click', handleExport);
    resetAllBtn.addEventListener('click', confirmResetAll);
    refreshBtn.addEventListener('click', () => {
      timerList.innerHTML = '<div class="loading"><span class="loading-spinner"></span><p>Atualizando dados...</p></div>';
      loadTimerData();
    });
    
    // Configurar eventos do menu de contexto
    resetTimerOption.addEventListener('click', () => {
      if (currentContextTicketId) {
        confirmResetTimer(currentContextTicketId, currentContextTicketInfo?.title);
        hideContextMenu();
      }
    });
    
    copyTimeOption.addEventListener('click', () => {
      if (currentContextTicketTime) {
        navigator.clipboard.writeText(currentContextTicketTime)
          .then(() => showSuccessMessage('Tempo copiado para a área de transferência'))
          .catch(() => showSuccessMessage('Falha ao copiar tempo', true));
        hideContextMenu();
      }
    });
    
    goToTicketOption.addEventListener('click', () => {
      if (currentContextTicketId) {
        chrome.tabs.create({url: `https://app.hubspot.com/contacts/1796841/ticket/${currentContextTicketId}/`});
        hideContextMenu();
      }
    });
    
    // Fechar menu de contexto ao clicar fora
    document.addEventListener('click', hideContextMenu);
    
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
                    cda: 'Não informado',
                    status: 'Desconhecido'
                  };
              
              activeTimerInfo.classList.remove('no-active-timer');
              activeTimerInfo.innerHTML = `
                <div class="section-title">
                  Timer Atual 
                  <span class="badge badge-active">Ativo</span>
                </div>
                <div class="active-timer-content">
                  <div class="timer-info">
                    <div class="ticket-title">${ticketInfo.title}</div>
                    <div class="ticket-id">#${activeTicket}</div>
                  </div>
                  <div class="timer-meta">
                    <span class="ticket-tag">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px; vertical-align: middle;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      ${ticketInfo.owner}
                    </span>
                    <span class="ticket-tag">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px; vertical-align: middle;">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      </svg>
                      ${ticketInfo.status}
                    </span>
                  </div>
                  <div class="timer-info">
                    <div class="timer-label">Tempo atual</div>
                    <div id="active-timer-value" class="timer-value">${formatTimeWithSeconds(totalSeconds)}</div>
                  </div>
                  <div class="timer-info">
                    <div class="timer-label">Iniciado em</div>
                    <div>${formatDate(startTime)}</div>
                  </div>
                  <button id="pause-timer-btn" class="btn btn-secondary" style="margin-top: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                    Pausar Timer
                  </button>
                </div>
              `;
              
              // Adicionar evento para pausar o timer
              document.getElementById('pause-timer-btn').addEventListener('click', () => {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                  chrome.tabs.sendMessage(tabs[0].id, {
                    action: "pauseTimer", 
                    ticketId: activeTicket
                  }, function() {
                    loadTimerData(); // Recarregar dados após pausar
                  });
                });
              });
              
              // Iniciar um atualizador para o timer ativo no popup
              startActiveTimerUpdater(ticketTimers[activeTicket] || 0, startTime);
            });
          });
        } else {
          activeTimerInfo.classList.add('no-active-timer');
          activeTimerInfo.innerHTML = `
            <div class="section-title">Timer Atual</div>
            <div class="active-timer-content">
              <div class="timer-info" style="text-align: center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; color: #7c98b6;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Nenhum timer ativo no momento.</p>
                <p style="font-size: 11px; color: #7c98b6; margin-top: 8px;">
                  Clique no ícone do cronômetro em um ticket para iniciar o monitoramento.
                </p>
              </div>
            </div>
          `;
        }
        
        // Exibir lista de timers
        if (Object.keys(ticketTimers).length === 0) {
          timerList.innerHTML = `
            <div class="empty-state">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              Nenhum ticket monitorado ainda.
              <p style="font-size: 11px; margin-top: 8px; color: #7c98b6;">
                Para iniciar o monitoramento, navegue até um ticket e clique no ícone do cronômetro.
              </p>
            </div>
          `;
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
                
                const formattedTime = formatTimeWithSeconds(totalSeconds);
                
                const itemEl = document.createElement('div');
                itemEl.className = `timer-item ${isActive ? 'active' : ''}`;
                itemEl.dataset.ticketId = ticketId;
                itemEl.dataset.ticketTime = formattedTime;
                itemEl.dataset.totalSeconds = totalSeconds;
                
                itemEl.innerHTML = `
                  <div class="timer-details">
                    <div class="ticket-title">${ticketInfo.title}</div>
                    <div class="ticket-id">#${ticketId}</div>
                    <div class="ticket-meta">
                      <span class="ticket-tag">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px; vertical-align: middle;">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${ticketInfo.owner}
                      </span>
                      <span class="ticket-tag">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px; vertical-align: middle;">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        </svg>
                        ${ticketInfo.status}
                      </span>
                    </div>
                  </div>
                  <div class="timer-value-display">${formattedTime}</div>
                `;
                
                // Adicionar identificador para atualização contínua se for o timer ativo
                if (isActive) {
                  itemEl.querySelector('.timer-value-display').id = `active-timer-${ticketId}`;
                }
                
                // Adicionar evento para mostrar menu de contexto com clique direito
                itemEl.addEventListener('contextmenu', (e) => {
                  e.preventDefault();
                  showContextMenu(e, ticketId, formattedTime, ticketInfo);
                });
                
                // Adicionar evento de clique duplo para abrir o ticket
                itemEl.addEventListener('dblclick', () => {
                  chrome.tabs.create({url: `https://app.hubspot.com/contacts/1796841/ticket/${ticketId}/`});
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
            loadingEl.innerHTML = '<span class="loading-spinner"></span><p>Carregando informações...</p>';
            timerList.appendChild(loadingEl);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados dos timers:', error);
        timerList.innerHTML = `
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon" style="color: #ff5c35;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Erro ao carregar dados.
            <p style="font-size: 11px; margin-top: 8px; color: #7c98b6;">
              Tente atualizar a página ou reiniciar a extensão.
            </p>
          </div>
        `;
      }
    }
    
    // Função para iniciar o atualizador do timer ativo no popup
    function startActiveTimerUpdater(baseSeconds, startTime) {
      let updaterInterval = setInterval(() => {
        // Verificar se ainda estamos no popup
        if (!document.getElementById('active-timer-value')) {
          clearInterval(updaterInterval);
          return;
        }
        
        // Calcular o tempo atual
        const elapsedSeconds = Math.floor((new Date() - startTime) / 1000);
        const totalSeconds = baseSeconds + elapsedSeconds;
        
        // Atualizar os displays de tempo
        const timerValueEl = document.getElementById('active-timer-value');
        if (timerValueEl) {
          timerValueEl.textContent = formatTimeWithSeconds(totalSeconds);
        }
        
        // Atualizar também na lista de tickets
        const activeTimerInList = document.getElementById(`active-timer-${startTime}`);
        if (activeTimerInList) {
          activeTimerInList.textContent = formatTimeWithSeconds(totalSeconds);
        }
      }, 1000);
    }
    
    // Função para exportar os dados dos timers
    async function handleExport() {
      try {
        exportBtn.disabled = true;
        exportBtn.innerHTML = `
          <span class="loading-spinner" style="width:14px;height:14px;margin-right:8px;"></span>
          Exportando...
        `;
        
        // Enviar comando para exportar relatório
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {action: "exportTimerReport"}, function(response) {
            setTimeout(() => {
              exportBtn.disabled = false;
              exportBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Exportar Relatório
              `;
              
              if (response && response.success) {
                showSuccessMessage('Relatório exportado com sucesso!');
              } else {
                showSuccessMessage('Erro ao exportar relatório', true);
              }
            }, 1000);
          });
        });
      } catch (error) {
        console.error('Erro ao exportar dados:', error);
        showSuccessMessage('Erro ao exportar relatório!', true);
        
        exportBtn.disabled = false;
        exportBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Exportar Relatório
        `;
      }
    }
    
    // Função para confirmar reset de todos os timers
    function confirmResetAll() {
      resetAllBtn.disabled = true;
      resetAllBtn.innerHTML = `
        <span class="loading-spinner" style="width:14px;height:14px;margin-right:8px;"></span>
        Processando...
      `;
      
      if (confirm('Tem certeza que deseja resetar todos os timers? Esta ação não pode ser desfeita.')) {
        chrome.storage.local.set({
          ticketTimers: {},
          activeTicket: null,
          timerStartTime: null
        }, () => {
          setTimeout(() => {
            loadTimerData();
            showSuccessMessage('Todos os timers foram resetados!');
            
            resetAllBtn.disabled = false;
            resetAllBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Resetar
            `;
          }, 500);
        });
      } else {
        resetAllBtn.disabled = false;
        resetAllBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Resetar
        `;
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
    
    // Função para mostrar o menu de contexto
    function showContextMenu(event, ticketId, formattedTime, ticketInfo) {
      // Armazenar informações do ticket atual para uso nas opções do menu
      currentContextTicketId = ticketId;
      currentContextTicketTime = formattedTime;
      currentContextTicketInfo = ticketInfo;
      
      // Posicionar o menu
      const x = event.clientX;
      const y = event.clientY;
      
      // Verificar limites da janela
      const menuWidth = 160; // Largura aproximada do menu
      const menuHeight = 120; // Altura aproximada do menu
      const rightEdge = window.innerWidth - menuWidth;
      const bottomEdge = window.innerHeight - menuHeight;
      
      contextMenu.style.left = `${Math.min(x, rightEdge)}px`;
      contextMenu.style.top = `${Math.min(y, bottomEdge)}px`;
      
      // Mostrar o menu
      contextMenu.classList.add('show');
      
      // Impedir que o evento se propague
      event.stopPropagation();
    }
    
    // Função para esconder o menu de contexto
    function hideContextMenu() {
      contextMenu.classList.remove('show');
    }
    
    // Função para mostrar mensagem de sucesso
    function showSuccessMessage(message, isError = false) {
      // Remover mensagem anterior se existir
      const existingMsg = document.querySelector('.success-message');
      if (existingMsg) {
        existingMsg.remove();
      }
      
      const successMsg = document.createElement('div');
      successMsg.className = 'success-message';
      if (isError) {
        successMsg.style.backgroundColor = '#ff5c35';
      }
      successMsg.textContent = message;
      
      document.body.appendChild(successMsg);
      
      // Remover após 3 segundos com animação de fade out
      setTimeout(() => {
        successMsg.style.opacity = '0';
        successMsg.style.transform = 'translateY(10px)';
        setTimeout(() => successMsg.remove(), 300);
      }, 2700);
    }
    
    // Utilidades para formatação
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