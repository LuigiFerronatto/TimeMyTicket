// popup.js - Script para a interface do popup da extensão

document.addEventListener('DOMContentLoaded', async () => {
  // ===== Elementos do DOM =====
  // Áreas principais
  const activeTimerInfo = document.getElementById('active-timer-info');
  const timerList = document.getElementById('timer-list');
  const phaseList = document.getElementById('phase-list');
  const phaseBar = document.getElementById('phase-bar');
  const phaseLegend = document.getElementById('phase-legend');
  const phaseTicketSelector = document.getElementById('phase-ticket-selector');
  
  // Botões
  const exportBtn = document.getElementById('export-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  
  // Tabs
  const tabTickets = document.getElementById('tab-tickets');
  const tabPhases = document.getElementById('tab-phases');
  const ticketsTabContent = document.getElementById('tickets-tab-content');
  const phasesTabContent = document.getElementById('phases-tab-content');
  
  // Menu de contexto
  const contextMenu = document.getElementById('context-menu');
  const viewPhasesOption = document.getElementById('view-phases');
  const addTimeOption = document.getElementById('add-time');
  const copyTimeOption = document.getElementById('copy-time');
  const goToTicketOption = document.getElementById('go-to-ticket');
  const resetTimerOption = document.getElementById('reset-timer');
  
  // Modal para adicionar tempo
  const addTimeModal = document.getElementById('add-time-modal');
  const modalTicketName = document.getElementById('modal-ticket-name');
  const modalTicketId = document.getElementById('modal-ticket-id');
  const phaseSelect = document.getElementById('phase-select');
  const hoursInput = document.getElementById('hours-input');
  const minutesInput = document.getElementById('minutes-input');
  const modalCancelBtn = document.getElementById('modal-cancel');
  const modalSaveBtn = document.getElementById('modal-save');
  const modalCloseBtn = document.querySelector('.modal-close');
  
  // ===== Estado da Aplicação =====
  let currentContextTicketId = null;
  let currentContextTicketTime = null;
  let currentContextTicketInfo = null;
  
  // Lista de fases conhecidas no HubSpot
  const knownPhases = [
    'Novo', 'Triagem', 'Backlog', 'Descoberta e Ideação',
    'Desenvolvimento', 'Preenchimento de RFP', 'Validação Inicial',
    'Apresentação', 'Refinamento e Consolidação', 'Impedidos', 
    'Entregues', 'Dispensados'
  ];
  
  // Cores para as fases (em ordem)
  const phaseColors = [
    '#FF5C35', '#FFB100', '#F2854C', '#00A4BD', 
    '#00BDA5', '#6A78D1', '#7C98B6', '#0091AE', 
    '#9FB5C9', '#D5DAE0', '#516F90', '#32373C'
  ];
  
  // Mapear fases para cores
  const phaseColorMap = {};
  knownPhases.forEach((phase, index) => {
    phaseColorMap[phase] = phaseColors[index % phaseColors.length];
  });
  
  // ===== Inicialização =====
  // Carregar dados dos timers
  loadTimerData();
  
  // ===== Event Listeners =====
  // Botões principais
  exportBtn.addEventListener('click', handleExport);
  resetAllBtn.addEventListener('click', confirmResetAll);
  refreshBtn.addEventListener('click', () => {
    timerList.innerHTML = '<div class="loading"><span class="loading-spinner"></span><p>Atualizando dados...</p></div>';
    phaseList.innerHTML = '<div class="loading"><span class="loading-spinner"></span><p>Atualizando dados...</p></div>';
    loadTimerData();
  });
  
  // Tabs
  tabTickets.addEventListener('click', () => {
    tabTickets.classList.add('active');
    tabPhases.classList.remove('active');
    ticketsTabContent.style.display = 'block';
    phasesTabContent.style.display = 'none';
  });
  
  tabPhases.addEventListener('click', () => {
    tabPhases.classList.add('active');
    tabTickets.classList.remove('active');
    phasesTabContent.style.display = 'block';
    ticketsTabContent.style.display = 'none';
    renderPhaseData();
  });
  
  // Seletor de ticket para fase
  phaseTicketSelector.addEventListener('change', renderPhaseData);
  
  // Menu de contexto
  viewPhasesOption.addEventListener('click', () => {
    if (currentContextTicketId) {
      // Mudar para a aba de fases e filtrar pelo ticket atual
      tabPhases.click();
      phaseTicketSelector.value = currentContextTicketId;
      renderPhaseData();
      hideContextMenu();
    }
  });
  
  addTimeOption.addEventListener('click', () => {
    if (currentContextTicketId && currentContextTicketInfo) {
      showAddTimeModal(currentContextTicketId, currentContextTicketInfo);
      hideContextMenu();
    }
  });
  
  copyTimeOption.addEventListener('click', () => {
    if (currentContextTicketId) {
      copyTimeReport(currentContextTicketId);
      hideContextMenu();
    }
  });
  
  goToTicketOption.addEventListener('click', () => {
    if (currentContextTicketId) {
      chrome.tabs.create({url: `https://app.hubspot.com/contacts/1796841/ticket/${currentContextTicketId}/`});
      hideContextMenu();
    }
  });
  
  resetTimerOption.addEventListener('click', () => {
    if (currentContextTicketId) {
      confirmResetTimer(currentContextTicketId, currentContextTicketInfo?.title);
      hideContextMenu();
    }
  });
  
  // Modal para adicionar tempo
  modalCancelBtn.addEventListener('click', hideAddTimeModal);
  modalCloseBtn.addEventListener('click', hideAddTimeModal);
  modalSaveBtn.addEventListener('click', handleAddTime);
  
  // Fechar menu de contexto ao clicar fora
  document.addEventListener('click', hideContextMenu);
  
  // ===== Funções de Carregamento de Dados =====
  async function loadTimerData() {
    try {
      // Obter dados do armazenamento
      const data = await chrome.storage.local.get([
        'ticketTimers', 'activeTicket', 'timerStartTime', 'ticketTitles', 
        'phaseTimers', 'currentPhases', 'lastPhaseChange'
      ]);
      
      const { 
        ticketTimers = {}, 
        activeTicket, 
        timerStartTime, 
        ticketTitles = {},
        phaseTimers = {},
        currentPhases = {}
      } = data;
      
      // Exibir informação do timer ativo
      renderActiveTimer(ticketTimers, activeTicket, timerStartTime, ticketTitles);
      
      // Exibir lista de tickets
      renderTicketList(ticketTimers, activeTicket, timerStartTime, ticketTitles, currentPhases);
      
      // Preencher o selector de tickets para a aba de fases
      populateTicketSelector(ticketTimers, ticketTitles);
      
      // Renderizar dados de fase
      renderPhaseData(phaseTimers);
    } catch (error) {
      console.error('Erro ao carregar dados dos timers:', error);
      showErrorState();
    }
  }
  
  // ===== Funções de Renderização =====
  function renderActiveTimer(ticketTimers, activeTicket, timerStartTime, ticketTitles) {
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
                action: "pauseTimer"
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
  }
  
  function renderTicketList(ticketTimers, activeTicket, timerStartTime, ticketTitles, currentPhases) {
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
      return;
    }
    
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
                status: 'Desconhecido',
                timeInPhases: {}
              };
          
          const isActive = ticketId === activeTicket;
          const currentPhase = currentPhases[ticketId] || 'Desconhecido';
          
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
              <div class="ticket-phase">Fase atual: ${currentPhase}</div>
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
  
  function populateTicketSelector(ticketTimers, ticketTitles) {
    // Limpar opções atuais
    phaseTicketSelector.innerHTML = '<option value="all">Todos tickets</option>';
    
    // Adicionar cada ticket com tempo registrado
    Object.keys(ticketTimers).forEach(ticketId => {
      const title = ticketTitles[ticketId] || `Ticket #${ticketId}`;
      const option = document.createElement('option');
      option.value = ticketId;
      option.textContent = title;
      phaseTicketSelector.appendChild(option);
    });
  }
  
  function renderPhaseData() {
    chrome.storage.local.get(['phaseTimers', 'ticketTimers', 'ticketTitles'], function(data) {
      const { phaseTimers = {}, ticketTimers = {}, ticketTitles = {} } = data;
      const selectedTicketId = phaseTicketSelector.value;
      
      // Limpar elementos anteriores
      phaseList.innerHTML = '';
      phaseBar.innerHTML = '';
      phaseLegend.innerHTML = '';
      
      // Se não há dados de fase
      if (Object.keys(phaseTimers).length === 0) {
        phaseList.innerHTML = `
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Nenhum dado de fase registrado.
            <p style="font-size: 11px; margin-top: 8px; color: #7c98b6;">
              Os dados de fase são coletados automaticamente conforme os tickets são movidos entre as colunas do pipeline.
            </p>
          </div>
        `;
        return;
      }
      
      // Calcular totais por fase
      let phaseTotals = {};
      let totalTime = 0;
      
      if (selectedTicketId === 'all') {
        // Calcular totais para todos os tickets
        Object.keys(phaseTimers).forEach(ticketId => {
          const phases = phaseTimers[ticketId];
          Object.entries(phases).forEach(([phase, time]) => {
            phaseTotals[phase] = (phaseTotals[phase] || 0) + time;
            totalTime += time;
          });
        });
      } else {
        // Calcular apenas para o ticket selecionado
        const phases = phaseTimers[selectedTicketId] || {};
        Object.entries(phases).forEach(([phase, time]) => {
          phaseTotals[phase] = time;
          totalTime += time;
        });
      }
      
      // Se nenhuma fase tem tempo
      if (totalTime === 0) {
        phaseList.innerHTML = `
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-state-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Nenhum tempo registrado em fases.
            <p style="font-size: 11px; margin-top: 8px; color: #7c98b6;">
              ${selectedTicketId === 'all' ? 
                'Nenhum ticket tem tempo registrado em fases.' : 
                `O ticket "${ticketTitles[selectedTicketId] || 'selecionado'}" não tem tempo registrado em fases.`}
            </p>
          </div>
        `;
        return;
      }
      
      // Ordenar fases por tempo (decrescente)
      const sortedPhases = Object.entries(phaseTotals)
        .sort(([, timeA], [, timeB]) => timeB - timeA);
      
      // Renderizar lista de fases
      sortedPhases.forEach(([phase, time]) => {
        const percentage = Math.round((time / totalTime) * 100);
        const phaseItem = document.createElement('div');
        phaseItem.className = 'phase-item';
        phaseItem.innerHTML = `
          <div>
            <div class="phase-item-name">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${phaseColorMap[phase] || '#7c98b6'}; margin-right: 5px;"></span>
              ${phase}
            </div>
            <div style="font-size: 11px; color: #7c98b6;">${percentage}% do tempo total</div>
          </div>
          <div class="phase-item-time">${formatTimeWithSeconds(time)}</div>
        `;
        phaseList.appendChild(phaseItem);
      });
      
      // Renderizar barra de distribuição
      sortedPhases.forEach(([phase, time]) => {
        const percentage = (time / totalTime) * 100;
        const segment = document.createElement('div');
        segment.className = 'phase-segment';
        segment.style.width = `${percentage}%`;
        segment.style.backgroundColor = phaseColorMap[phase] || '#7c98b6';
        segment.setAttribute('title', `${phase}: ${formatTimeWithSeconds(time)} (${Math.round(percentage)}%)`);
        phaseBar.appendChild(segment);
      });
      
      // Renderizar legenda
      const topPhases = sortedPhases.slice(0, 5); // Mostrar apenas as 5 maiores fases
      topPhases.forEach(([phase, time]) => {
        const percentage = Math.round((time / totalTime) * 100);
        const legendItem = document.createElement('div');
        legendItem.className = 'phase-legend-item';
        legendItem.innerHTML = `
          <span class="phase-color" style="background-color: ${phaseColorMap[phase] || '#7c98b6'};"></span>
          <span>${phase} (${percentage}%)</span>
        `;
        phaseLegend.appendChild(legendItem);
      });
    });
  }
  
  function showErrorState() {
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
    
    phaseList.innerHTML = timerList.innerHTML;
  }
  
  // ===== Funções do Timer =====
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
  
  // ===== Funções de Manipulação =====
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
        timerStartTime: null,
        phaseTimers: {},
        currentPhases: {},
        lastPhaseChange: {}
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
  
  function confirmResetTimer(ticketId, ticketTitle) {
    const displayTitle = ticketTitle || `Ticket #${ticketId}`;
    if (confirm(`Tem certeza que deseja resetar o timer de "${displayTitle}"? Esta ação não pode ser desfeita.`)) {
      // Enviar mensagem para o background script
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'resetTicketTimer',
          ticketId: ticketId
        }, function() {
          // Recarregar dados
          chrome.storage.local.get(['phaseTimers'], function(data) {
            const { phaseTimers = {} } = data;
            // Remover dados de fase para este ticket
            if (phaseTimers[ticketId]) {
              delete phaseTimers[ticketId];
              chrome.storage.local.set({ phaseTimers }, () => {
                loadTimerData();
                showSuccessMessage(`Timer resetado com sucesso!`);
              });
            } else {
              loadTimerData();
              showSuccessMessage(`Timer resetado com sucesso!`);
            }
          });
        });
      });
    }
  }
  
  function copyTimeReport(ticketId) {
    chrome.storage.local.get(['phaseTimers', 'ticketTitles', 'ticketTimers'], function(data) {
      const { phaseTimers = {}, ticketTitles = {}, ticketTimers = {} } = data;
      const phaseData = phaseTimers[ticketId] || {};
      const ticketTitle = ticketTitles[ticketId] || `Ticket #${ticketId}`;
      
      // Construir relatório
      let report = `Tempo Gasto no Ticket: ${ticketTitle}\n`;
      report += `ID: ${ticketId}\n`;
      report += `Fases: `;
      
      // Adicionar tempo por fase
      let hasFaseData = false;
      for (const phase in phaseData) {
        const timeInPhase = phaseData[phase] || 0;
        if (timeInPhase > 0) {
          hasFaseData = true;
          report += `${phase}: ${formatTimeWithHoursAndMinutes(timeInPhase)} `;
        }
      }
      
      if (!hasFaseData) {
        report += "Nenhuma fase com tempo registrado. ";
      }
      
      // Adicionar tempo total
      report += `\nTempo Total: ${formatTimeWithHoursAndMinutes(ticketTimers[ticketId] || 0)}`;
      
      // Copiar para o clipboard
      navigator.clipboard.writeText(report)
        .then(() => {
          showSuccessMessage('Relatório copiado para a área de transferência', 'success');
        })
        .catch(err => {
          console.error('Erro ao copiar relatório:', err);
          showSuccessMessage('Erro ao copiar relatório', 'error');
        });
    });
  }
  
  // ===== Funções para o Modal de Adicionar Tempo =====
  function showAddTimeModal(ticketId, ticketInfo) {
    modalTicketName.textContent = ticketInfo.title || `Ticket #${ticketId}`;
    modalTicketId.textContent = `#${ticketId}`;
    
    // Preencher o select de fases
    phaseSelect.innerHTML = '';
    knownPhases.forEach(phase => {
      const option = document.createElement('option');
      option.value = phase;
      option.textContent = phase;
      
      // Selecionar a fase atual por padrão
      if (phase === ticketInfo.status) {
        option.selected = true;
      }
      
      phaseSelect.appendChild(option);
    });
    
    // Resetar inputs de tempo
    hoursInput.value = '0';
    minutesInput.value = '0';
    
    // Guardar o ID do ticket no botão salvar
    modalSaveBtn.dataset.ticketId = ticketId;
    
    // Mostrar o modal
    addTimeModal.classList.add('show');
  }
  
  function hideAddTimeModal() {
    addTimeModal.classList.remove('show');
  }
  
  function handleAddTime() {
    const ticketId = modalSaveBtn.dataset.ticketId;
    const phase = phaseSelect.value;
    const hours = parseInt(hoursInput.value) || 0;
    const minutes = parseInt(minutesInput.value) || 0;
    
    // Calcular segundos totais
    const secondsToAdd = hours * 3600 + minutes * 60;
    
    if (secondsToAdd <= 0) {
      showSuccessMessage('Por favor, informe um tempo válido', 'error');
      return;
    }
    
    // Enviar mensagem para adicionar tempo
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'addTimeToPhase',
        ticketId: ticketId,
        phase: phase,
        seconds: secondsToAdd
      }, function() {
        hideAddTimeModal();
        loadTimerData();
        showSuccessMessage(`${formatTimeWithHoursAndMinutes(secondsToAdd)} adicionado à fase "${phase}"`);
      });
    });
  }
  
  // ===== Funções para o Menu de Contexto =====
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
  
  function hideContextMenu() {
    contextMenu.classList.remove('show');
  }
  
  // ===== Funções Utilitárias =====
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
  
  function formatTimeWithSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  function formatTimeWithHoursAndMinutes(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours === 0 && minutes === 0) {
      return "menos de 1min";
    }
    
    let result = "";
    if (hours > 0) {
      result += `${hours}h `;
    }
    if (minutes > 0 || hours === 0) {
      result += `${minutes}min`;
    }
    
    return result.trim();
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


// Default colors for initialization - Assegura que as cores padrão estão definidas
const DEFAULT_COLORS = {
  lanes: {
    'Entregues': '#00bda5',
    'Dispensados': '#ff5c35',
    'Impedidos': '#ffab00'
  },
  owners: {
    'Thaila Bahiense': '#6a78d1',
    'Marcos Rodrigues': '#0091ae',
    'Pablo Sathler': '#00a4bd',
    'Luigi Ferronatto': '#f2854c',
    'Pedro Nascimento': '#7c98b6',
    'Fabricio Lago': '#9fb5c9',
    'Fernanda Cupertino': '#ff5c35'
  },
  customOwners: {}
};

// Função melhorada para inicializar as configurações
function initializeSettings() {
  console.log('Inicializando configurações de cores...');
  
  // Garantir que as configurações padrão estão salvas no localStorage
  const savedSettings = localStorage.getItem('timeMyTicket_colorSettings');
  if (!savedSettings) {
    console.log('Configurações não encontradas, salvando padrões...');
    saveSettings(DEFAULT_COLORS);
  }
  
  // Get tab and content elements
  const tabSettings = document.getElementById('tab-settings');
  const settingsTabContent = document.getElementById('settings-tab-content');
  
  // Add tab click event
  tabSettings.addEventListener('click', () => {
    // Hide other tab contents and deactivate tabs
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    
    // Activate settings tab
    tabSettings.classList.add('active');
    settingsTabContent.style.display = 'block';
    
    // Load current settings
    loadSettings();
  });
  
  // Add event listeners for color pickers
  document.querySelectorAll('.color-picker').forEach(picker => {
    picker.addEventListener('change', handleColorChange);
  });
  
  // Add event listeners for reset buttons
  document.querySelectorAll('.reset-color-btn').forEach(btn => {
    btn.addEventListener('click', handleResetColor);
  });
  
  // Add event listener for adding custom owners
  document.getElementById('add-custom-owner-btn').addEventListener('click', addCustomOwner);
  
  // Add event listeners for main action buttons
  document.getElementById('save-settings-btn').addEventListener('click', saveAllSettings);
  document.getElementById('reset-all-settings-btn').addEventListener('click', resetAllSettings);
}

// Função melhorada para obter configurações
function getSettings() {
  const savedSettings = localStorage.getItem('timeMyTicket_colorSettings');
  if (savedSettings) {
    try {
      return JSON.parse(savedSettings);
    } catch (e) {
      console.error('Erro ao analisar configurações salvas:', e);
      return JSON.parse(JSON.stringify(DEFAULT_COLORS));
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_COLORS));
}

// Função para salvar configurações
function saveSettings(settings) {
  localStorage.setItem('timeMyTicket_colorSettings', JSON.stringify(settings));
  console.log('Configurações salvas:', settings);
}

// Carregar configurações para a UI
function loadSettings() {
  console.log('Carregando configurações para a UI...');
  let settings = getSettings();
  
  // Set colors for lanes
  Object.keys(settings.lanes).forEach(lane => {
    const colorPicker = document.querySelector(`[data-type="lane"][data-name="${lane}"]`);
    if (colorPicker) {
      colorPicker.value = settings.lanes[lane];
    }
  });
  
  // Set colors for predefined owners
  Object.keys(settings.owners).forEach(owner => {
    const colorPicker = document.querySelector(`[data-type="owner"][data-name="${owner}"]`);
    if (colorPicker) {
      colorPicker.value = settings.owners[owner];
    }
  });
  
  // Render custom owners
  renderCustomOwners(settings.customOwners);
}

// Handle color change events - Versão corrigida
function handleColorChange(event) {
  const colorPicker = event.target;
  const type = colorPicker.dataset.type;
  const name = colorPicker.dataset.name;
  
  if (!type || !name) {
    console.warn('Picker sem tipo ou nome:', colorPicker);
    return;
  }
  
  console.log(`Cor alterada: ${type} - ${name} = ${colorPicker.value}`);
}

// Handle reset color button clicks - Versão corrigida
function handleResetColor(event) {
  const btn = event.target;
  const targetId = btn.dataset.target;
  const colorPicker = document.getElementById(targetId);
  
  if (colorPicker) {
    const type = colorPicker.dataset.type;
    const name = colorPicker.dataset.name;
    
    if (type === 'lane' && DEFAULT_COLORS.lanes[name]) {
      colorPicker.value = DEFAULT_COLORS.lanes[name];
    } else if (type === 'owner' && DEFAULT_COLORS.owners[name]) {
      colorPicker.value = DEFAULT_COLORS.owners[name];
    }
  }
}

// Render custom owners list - Versão corrigida
function renderCustomOwners(customOwners) {
  const container = document.getElementById('custom-owners-list');
  if (!container) {
    console.error('Container de proprietários personalizados não encontrado!');
    return;
  }
  
  container.innerHTML = '';
  
  if (Object.keys(customOwners).length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size: 12px; color: #7c98b6; text-align: center; margin-top: 10px;">Nenhum responsável personalizado adicionado</p>';
    return;
  }
  
  Object.entries(customOwners).forEach(([name, color]) => {
    const item = document.createElement('div');
    item.className = 'custom-owner-item';
    item.innerHTML = `
      <div class="color-preview" style="background-color: ${color};"></div>
      <div class="name">${name}</div>
      <input type="color" class="color-picker custom-owner-color" value="${color}" data-name="${name}">
      <button class="remove-btn" data-name="${name}">&times;</button>
    `;
    
    // Add event listener for color change
    const colorPicker = item.querySelector('.custom-owner-color');
    colorPicker.addEventListener('change', (e) => {
      let settings = getSettings();
      settings.customOwners[name] = e.target.value;
      console.log(`Cor personalizada alterada: ${name} = ${e.target.value}`);
    });
    
    // Add event listener for remove button
    const removeBtn = item.querySelector('.remove-btn');
    removeBtn.addEventListener('click', () => removeCustomOwner(name));
    
    container.appendChild(item);
  });
}

// Remove a custom owner
function removeCustomOwner(name) {
  let settings = getSettings();
  if (settings.customOwners[name]) {
    delete settings.customOwners[name];
    saveSettings(settings);
    renderCustomOwners(settings.customOwners);
    showToast(`Responsável "${name}" removido`, 'info');
  }
}

// Add a custom owner - Versão corrigida
function addCustomOwner() {
  const nameInput = document.getElementById('custom-owner-name');
  const colorInput = document.getElementById('custom-owner-color');
  
  if (!nameInput || !colorInput) {
    console.error('Campos de entrada não encontrados!');
    return;
  }
  
  const name = nameInput.value.trim();
  const color = colorInput.value;
  
  if (!name) {
    showToast('Por favor, insira um nome ou email válido', 'error');
    return;
  }
  
  // Add to settings
  let settings = getSettings();
  settings.customOwners[name] = color;
  saveSettings(settings);
  
  // Render updated custom owners list
  renderCustomOwners(settings.customOwners);
  
  // Clear inputs
  nameInput.value = '';
  
  showToast(`Responsável "${name}" adicionado com sucesso`, 'success');
}

// Save all settings - Versão corrigida
function saveAllSettings() {
  let settings = getSettings();
  
  // Get all lane colors
  document.querySelectorAll('[data-type="lane"]').forEach(picker => {
    if (picker.dataset.name && settings.lanes[picker.dataset.name]) {
      settings.lanes[picker.dataset.name] = picker.value;
    }
  });
  
  // Get all predefined owner colors
  document.querySelectorAll('[data-type="owner"]').forEach(picker => {
    if (picker.dataset.name && settings.owners[picker.dataset.name]) {
      settings.owners[picker.dataset.name] = picker.value;
    }
  });
  
  // Get all custom owner colors
  document.querySelectorAll('.custom-owner-color').forEach(picker => {
    if (picker.dataset.name) {
      settings.customOwners[picker.dataset.name] = picker.value;
    }
  });
  
  // Save to localStorage
  saveSettings(settings);
  
  // Apply settings to active tabs
  applySettingsToTabs();
  
  showToast('Configurações salvas com sucesso', 'success');
}

// Reset all settings to defaults
function resetAllSettings() {
  if (confirm('Tem certeza que deseja resetar todas as configurações de cores? Esta ação não pode ser desfeita.')) {
    // Reset to default settings
    saveSettings(JSON.parse(JSON.stringify(DEFAULT_COLORS)));
    
    // Reload settings in the UI
    loadSettings();
    
    // Apply settings to active tabs
    applySettingsToTabs();
    
    showToast('Todas as configurações foram resetadas', 'info');
  }
}

// Apply settings to all active HubSpot tabs - Versão corrigida
function applySettingsToTabs() {
  chrome.tabs.query({url: "https://*.hubspot.com/*"}, (tabs) => {
    console.log(`Aplicando configurações a ${tabs.length} abas do HubSpot`);
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: "applyColorSettings" }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.warn(`Erro ao enviar mensagem para aba ${tab.id}:`, error.message);
        } else {
          console.log(`Configurações aplicadas à aba ${tab.id}:`, response);
        }
      });
    });
  });
}

// Show toast notification in popup
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.success-message');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create new toast
  const toast = document.createElement('div');
  toast.className = 'success-message';
  toast.textContent = message;
  
  // Set color based on type
  if (type === 'error') {
    toast.style.backgroundColor = '#ff5c35';
  } else if (type === 'success') {
    toast.style.backgroundColor = '#00bda5';
  } else if (type === 'warning') {
    toast.style.backgroundColor = '#ffab00';
  }
  
  document.body.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Código para inicializar as configurações quando o documento é carregado
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado, inicializando configurações...');
  // Add a small delay to ensure all elements are properly loaded
  setTimeout(initializeSettings, 100);
});