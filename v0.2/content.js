// Enhanced content.js with phase tracking functionality

class TicketTimer {
  constructor() {
    // Base state from original implementation
    this.ticketTimers = {}; // Total time per ticket
    this.activeTicket = null; // ID of active ticket
    this.timerStartTime = null; // When current timer started
    this.timerInterval = null; // Reference to interval
    this.ticketTitles = {}; // Store ticket titles
    
    // New phase tracking functionality
    this.phaseTimers = {}; // Structure: {ticketId: {phase1: seconds, phase2: seconds}}
    this.currentPhases = {}; // Current phase per ticket
    this.lastPhaseChange = {}; // When ticket last changed phase
    
    // HubSpot DOM selectors
    this.ticketCardSelector = '[data-test-id="cdb-column-item"]';
    this.ticketIdAttribute = 'data-selenium-id';
    this.phaseNameSelector = '[data-test-id="cdb-column-name"]';
    this.attemptCount = 0;
    this.injectHighlightStyles();
    
    // Known phases in your HubSpot pipeline
    this.knownPhases = [
      'Novo', 'Triagem', 'Backlog', 'Descoberta e Ideação',
      'Desenvolvimento', 'Preenchimento de RFP', 'Validação Inicial',
      'Apresentação', 'Refinamento e Consolidação', 'Impedidos', 
      'Entregues', 'Dispensados'
    ];
    
    // Initialize
    this.init();
  }
  
  async init() {
    console.log('Iniciando TimeMyTicket com rastreamento de fases...');
    
    // Load data from storage
    await this.loadDataFromStorage();
    
    // Add toast styles for notifications
    this.addToastStyles();
    
    // Initialize DOM observer
    this.initMutationObserver();

    TicketTimer.prototype.init = function() {
    
    // Process existing cards with short delay
    setTimeout(() => {
      console.log('Processando cards existentes e detectando fases...');
      this.processExistingCards();
      this.detectAndTrackPhases();
      
      // Resume active timer if needed
      if (this.activeTicket && this.timerStartTime) {
        console.log(`Retomando timer ativo para o ticket ${this.activeTicket}`);
        this.resumeActiveTimer();
        
        // Verificar fase atual do ticket ativo
        const ticketCard = document.querySelector(`${this.ticketCardSelector}[${this.ticketIdAttribute}="${this.activeTicket}"]`);
        if (ticketCard) {
          const column = ticketCard.closest('[data-test-id="cdb-column"]');
          if (column) {
            const phaseNameElement = column.querySelector(this.phaseNameSelector);
            if (phaseNameElement) {
              const phaseName = phaseNameElement.textContent.trim();
              console.log(`Ticket ativo ${this.activeTicket} está na fase "${phaseName}"`);
              
              // Atualizar fase atual se necessário
              if (this.currentPhases[this.activeTicket] !== phaseName) {
                console.log(`Atualizando fase do ticket ativo para "${phaseName}"`);
                this.handlePhaseChange(this.activeTicket, phaseName);
              }
            }
          }
        }
      }
      
      // Executar detectAndTrackPhases novamente após 5 segundos
      // para garantir que todas as fases foram detectadas corretamente
      setTimeout(() => {
        console.log('Executando segunda verificação de fases...');
        this.detectAndTrackPhases();
      }, 5000);
    }, 1500);
    
    // Retry processing at intervals to catch dynamically loaded content
    this.startRetryProcessor();
    this.applyColorSettings();
  }};
  
  async loadDataFromStorage() {
    // Load core timer data
    const data = await this.getFromStorage([
      'ticketTimers', 'activeTicket', 'timerStartTime', 'ticketTitles',
      'phaseTimers', 'currentPhases', 'lastPhaseChange' // New phase tracking data
    ]);
    
    this.ticketTimers = data.ticketTimers || {};
    this.activeTicket = data.activeTicket || null;
    this.timerStartTime = data.timerStartTime ? new Date(data.timerStartTime) : null;
    this.ticketTitles = data.ticketTitles || {};
    
    // Initialize phase tracking data
    this.phaseTimers = data.phaseTimers || {};
    this.currentPhases = data.currentPhases || {};
    this.lastPhaseChange = data.lastPhaseChange || {};
    
    console.log('Dados carregados:', { 
      ticketsMonitorados: Object.keys(this.ticketTimers).length,
      ticketAtivo: this.activeTicket,
      fasesMonitoradas: Object.keys(this.phaseTimers).length
    });
  }
  
  getFromStorage(keys) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(keys, resolve);
      } else {
        // Fallback to localStorage
        const result = {};
        keys.forEach(key => {
          const value = localStorage.getItem(`hubspot_timer_${key}`);
          result[key] = value ? JSON.parse(value) : null;
        });
        resolve(result);
      }
    });
  }
  
  saveToStorage(data) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(data);
    } else {
      // Fallback to localStorage
      Object.keys(data).forEach(key => {
        localStorage.setItem(`hubspot_timer_${key}`, JSON.stringify(data[key]));
      });
    }
    console.log('Dados salvos:', data);
  }
  
  startRetryProcessor() {
    const retryIntervals = [3000, 5000, 10000, 15000, 30000, 60000];
    
    const processorInterval = setInterval(() => {
      this.attemptCount++;
      console.log(`Tentativa ${this.attemptCount} de processar cards e fases`);
      this.processExistingCards();
      this.detectAndTrackPhases();
      
      if (this.attemptCount >= retryIntervals.length) {
        clearInterval(processorInterval);
        console.log('Finalizadas tentativas programadas de processamento');
      }
    }, retryIntervals[this.attemptCount]);
  }
  
  initMutationObserver() {
    // Configura um MutationObserver para detectar mudanças no DOM
    const observer = new MutationObserver((mutations) => {
      let shouldProcessCards = false;
      let shouldCheckPhases = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Verifica se houve adição de cards
          const cardAdded = Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return node.matches?.(this.ticketCardSelector) || 
                node.querySelector?.(this.ticketCardSelector);
            }
            return false;
          });
          
          if (cardAdded) {
            shouldProcessCards = true;
          }
          
          // Verifica se houve alteração nas colunas/fases
          const phaseChanged = Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return node.matches?.('[data-test-id="cdb-column"]') || 
                node.querySelector?.('[data-test-id="cdb-column"]');
            }
            return false;
          });
          
          if (phaseChanged) {
            shouldCheckPhases = true;
          }
        }
      });
      
      if (shouldProcessCards) {
        setTimeout(() => {
          console.log('Detectada adição de cards, processando...');
          this.processExistingCards();
        }, 500);
      }
      
      if (shouldCheckPhases) {
        setTimeout(() => {
          console.log('Detectada alteração de fases, atualizando...');
          this.detectAndTrackPhases();
        }, 500);
      }
    });
    
    // Inicia a observação no body do documento
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('MutationObserver iniciado');
  }
  
  processExistingCards() {
    // Encontra todos os cards de ticket na página atual
    const cards = document.querySelectorAll(this.ticketCardSelector);
    console.log(`Processando ${cards.length} cards encontrados`);
    TicketTimer.prototype.processExistingCards = function() {
    cards.forEach(card => {
      // Verifica se o card já foi processado
      if (!card.querySelector('.ticket-timer-icon')) {
        this.addTimerToCard(card);
      }
    });
    this.applyColorSettings();
    
  }};
  
  detectAndTrackPhases() {
    console.log('Detectando e rastreando fases...');
    // Encontrar todas as colunas/fases
    const columns = document.querySelectorAll('[data-test-id="cdb-column"]');
    
    // Registrar todos os tickets visualizados para detectar tickets removidos
    const visibleTickets = new Set();
    
    // Para cada coluna, identifica os tickets presentes
    columns.forEach(column => {
      // Obter o nome da fase
      const phaseNameElement = column.querySelector(this.phaseNameSelector);
      if (!phaseNameElement) return;
      
      const phaseName = phaseNameElement.textContent.trim();
      console.log(`Processando fase: ${phaseName}`);
      
      // Obter todos os tickets nesta fase
      const ticketCards = column.querySelectorAll(this.ticketCardSelector);
      console.log(`Encontrados ${ticketCards.length} tickets na fase "${phaseName}"`);
      
      ticketCards.forEach(card => {
        const ticketId = card.getAttribute(this.ticketIdAttribute);
        if (!ticketId) return;
        
        // Marcar este ticket como visto
        visibleTickets.add(ticketId);
        
        // Inicializar rastreamento de fase se este é o primeiro encontro com o ticket
        if (!this.currentPhases[ticketId]) {
          console.log(`Inicializando rastreamento para ticket ${ticketId} na fase "${phaseName}"`);
          this.currentPhases[ticketId] = phaseName;
          this.lastPhaseChange[ticketId] = new Date().toISOString();
          
          // Salvar no armazenamento
          this.saveToStorage({
            currentPhases: this.currentPhases,
            lastPhaseChange: this.lastPhaseChange
          });
        }
        // Verificar se o ticket mudou de fase
        else if (this.currentPhases[ticketId] !== phaseName) {
          console.log(`Ticket ${ticketId} mudou da fase "${this.currentPhases[ticketId]}" para "${phaseName}"`);
          this.handlePhaseChange(ticketId, phaseName);
        }
      });
    });
    
    // Verificar fase atual de todos os tickets ativos quando o timer estiver ativo
    if (this.activeTicket) {
      console.log(`Verificando fase do ticket ativo ${this.activeTicket}`);
      // Certificar que a fase atual do ticket ativo está correta
      const activeTicketCard = document.querySelector(`${this.ticketCardSelector}[${this.ticketIdAttribute}="${this.activeTicket}"]`);
      if (activeTicketCard) {
        const column = activeTicketCard.closest('[data-test-id="cdb-column"]');
        if (column) {
          const phaseNameElement = column.querySelector(this.phaseNameSelector);
          if (phaseNameElement) {
            const currentPhaseName = phaseNameElement.textContent.trim();
            if (this.currentPhases[this.activeTicket] !== currentPhaseName) {
              console.log(`Atualizando fase do ticket ativo para ${currentPhaseName}`);
              this.handlePhaseChange(this.activeTicket, currentPhaseName);
            }
          }
        }
      }
    }
  }  
  
  handlePhaseChange(ticketId, newPhase) {
    console.log(`Ticket ${ticketId} mudou para a fase: ${newPhase}`);
    
    const now = new Date();
    const oldPhase = this.currentPhases[ticketId];
    
    // Se o ticket já estava sendo monitorado, contabilizar o tempo na fase anterior
    if (oldPhase && this.lastPhaseChange[ticketId]) {
      const previousStartTime = new Date(this.lastPhaseChange[ticketId]);
      const timeInPreviousPhase = Math.floor((now - previousStartTime) / 1000);
      
      // Só contar o tempo se for razoável (evitar problemas de timestamp incorreto)
      if (timeInPreviousPhase > 0 && timeInPreviousPhase < 86400 * 30) { // Não mais que 30 dias
        console.log(`Calculando tempo na fase anterior: ${oldPhase}, tempo: ${timeInPreviousPhase} segundos`);
        
        // Inicializar a estrutura se necessário
        if (!this.phaseTimers[ticketId]) {
          this.phaseTimers[ticketId] = {};
        }
        
        // Acumular o tempo na fase anterior
        this.phaseTimers[ticketId][oldPhase] = (this.phaseTimers[ticketId][oldPhase] || 0) + timeInPreviousPhase;
        
        console.log(`Acumulado ${this.formatTimeWithSeconds(timeInPreviousPhase)} na fase "${oldPhase}" para o ticket ${ticketId}`);
        console.log(`Total na fase "${oldPhase}": ${this.formatTimeWithSeconds(this.phaseTimers[ticketId][oldPhase])}`);
        
        // Se o ticket está ativo, adicionar o tempo também ao timer geral
        if (this.activeTicket === ticketId) {
          console.log(`O ticket ${ticketId} estava ativo. Atualizando tempo acumulado.`);
          // O tempo total do ticket já está sendo rastreado separadamente pelo timer ativo
        } else {
          // Se o ticket não está ativo, adicionar o tempo gasto na fase ao tempo total
          this.ticketTimers[ticketId] = (this.ticketTimers[ticketId] || 0) + timeInPreviousPhase;
          console.log(`Tempo total atualizado para ${this.formatTimeWithSeconds(this.ticketTimers[ticketId])}`);
        }
      } else {
        console.warn(`Tempo calculado inválido para fase anterior: ${timeInPreviousPhase}s. Ignorando.`);
      }
    }
    
    // Atualizar fase atual e timestamp
    this.currentPhases[ticketId] = newPhase;
    this.lastPhaseChange[ticketId] = now.toISOString();
    
    // Salvar no storage com valores atualizados
    this.saveToStorage({
      phaseTimers: this.phaseTimers,
      currentPhases: this.currentPhases,
      lastPhaseChange: this.lastPhaseChange,
      ticketTimers: this.ticketTimers
    });
    
    // Mostrar toast informativo
    this.showToast(`Ticket movido para "${newPhase}"`, 'info');
    
    // Atualizar UI para refletir novas informações
    this.updateTimerDisplay(ticketId, this.ticketTimers[ticketId] || 0);
  }
  
  addTimerToCard(card) {
    // Obtém o ID do ticket
    const ticketId = card.getAttribute(this.ticketIdAttribute);
    if (!ticketId) {
      console.warn('Card sem ID de ticket:', card);
      return;
    }
    
    // Captura o título do ticket
    const titleElement = card.querySelector('[data-test-id="cdbc-title"] span span:last-child');
    const ticketTitle = titleElement ? titleElement.textContent.trim() : `Ticket #${ticketId}`;
    
    // Armazena o título do ticket
    this.ticketTitles[ticketId] = ticketTitle;
    this.saveToStorage({ ticketTitles: this.ticketTitles });
    
    // Verificar fase atual do ticket
    const column = card.closest('[data-test-id="cdb-column"]');
    if (column) {
      const phaseNameElement = column.querySelector(this.phaseNameSelector);
      if (phaseNameElement) {
        const phaseName = phaseNameElement.textContent.trim();
        
        // Se o ticket não tem fase registrada, inicializar
        if (!this.currentPhases[ticketId]) {
          this.currentPhases[ticketId] = phaseName;
          this.lastPhaseChange[ticketId] = new Date().toISOString();
          
          this.saveToStorage({
            currentPhases: this.currentPhases,
            lastPhaseChange: this.lastPhaseChange
          });
        }
      }
    }
    
    // Verificar se este ticket já tem tempo acumulado
    const hasTime = this.ticketTimers[ticketId] && this.ticketTimers[ticketId] > 0;
    const isActive = this.activeTicket === ticketId;
    
    // Encontrar o melhor local para inserir o timer
    let titleContainer = card.querySelector('.Card__StyledTitleContainer-sc-1o9oolf-0');
    
    if (!titleContainer) {
      titleContainer = card.querySelector('.Card__StyledHoverContainer-sc-1o9oolf-1');
    }
    
    if (!titleContainer) {
      titleContainer = card.querySelector('div[class*="StyledContainer"]') || 
                     card.querySelector('div[class*="Container"]');
    }
    
    if (!titleContainer) {
      console.warn(`Não foi possível encontrar um container adequado para o timer no ticket ${ticketId}. Usando o próprio card.`);
      titleContainer = card;
    }
    
    // Cria o elemento do ícone do timer
    const timerIcon = document.createElement('div');
    timerIcon.className = `ticket-timer-icon ${hasTime || isActive ? 'expanded' : 'minimized'} ${isActive ? 'active' : ''}`;
    timerIcon.setAttribute('data-tooltip', isActive ? 'Pausar cronômetro' : 'Iniciar cronômetro');
    timerIcon.innerHTML = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Corpo do cronômetro -->
  <circle cx="12" cy="13" r="8" stroke="#FF6F00" stroke-width="2" fill="white"/>

  <!-- Botão superior -->
  <rect x="10" y="2" width="4" height="2" rx="1" fill="#FF6F00"/>

  <!-- Alça lateral esquerda -->
  <line x1="5" y1="6" x2="7" y2="8" stroke="#FF6F00" stroke-width="2" stroke-linecap="round"/>

  <!-- Alça lateral direita -->
  <line x1="19" y1="6" x2="17" y2="8" stroke="#FF6F00" stroke-width="2" stroke-linecap="round"/>

  <!-- Ponteiro -->
  <line x1="12" y1="13" x2="15" y2="10" stroke="#FF6F00" stroke-width="2" stroke-linecap="round"/>

  <!-- Centro -->
  <circle cx="12" cy="13" r="1" fill="#FF6F00"/>
</svg>
        <span class="timer-display">${hasTime ? this.formatTimeWithSeconds(this.ticketTimers[ticketId]) : '00:00:00'}</span>
      `;
    
    // Adiciona evento de clique com feedback visual
    timerIcon.addEventListener('click', (e) => {
      e.stopPropagation(); // Impede que o card seja selecionado
      
      // Adicionar feedback visual ao clicar
      timerIcon.style.transform = 'scale(0.95)';
      setTimeout(() => {
        timerIcon.style.transform = '';
      }, 150);
      
      this.toggleTimer(ticketId);
    });
    
    // Adicionar evento de clique direito para menu de opções
    timerIcon.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      this.showTimerContextMenu(e, ticketId);
    });
    
    // Garantir posicionamento absoluto
    timerIcon.style.position = 'absolute';
    timerIcon.style.top = '8px';
    timerIcon.style.right = '8px';
    timerIcon.style.zIndex = '100';
    
    // Garantir que o container tem position relative para posicionamento absoluto
    if (titleContainer !== card) {
      const currentPosition = window.getComputedStyle(titleContainer).position;
      if (currentPosition === 'static') {
        titleContainer.style.position = 'relative';
      }
    }
    
    // Inserir no container
    titleContainer.appendChild(timerIcon);
    
    console.log(`Timer adicionado ao ticket ${ticketId}: "${ticketTitle}"`);
  }
  
  showTimerContextMenu(event, ticketId) {
    // Remover menu anterior se existir
    const oldMenu = document.getElementById('timer-context-menu');
    if (oldMenu) {
      oldMenu.remove();
    }
    
    // Criar o menu de contexto
    const menu = document.createElement('div');
    menu.id = 'timer-context-menu';
    menu.className = 'timer-context-menu';
    menu.style.position = 'absolute';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '10000';
    
    // Opções do menu
    const menuOptions = [
      {
        label: 'Ver detalhes por fase',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        action: () => this.showPhaseDetails(ticketId)
      },
      {
        label: 'Adicionar tempo manualmente',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
        action: () => this.showAddTimeManually(ticketId)
      },
      {
        label: 'Copiar relatório de tempo',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
        action: () => this.copyTimeReport(ticketId)
      },
      {
        label: 'Resetar timer',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
        action: () => this.confirmResetTimer(ticketId),
        danger: true
      }
    ];
    
    // Adicionar opções ao menu
    menuOptions.forEach(option => {
      const menuItem = document.createElement('div');
      menuItem.className = `timer-context-menu-item${option.danger ? ' danger' : ''}`;
      menuItem.innerHTML = `${option.icon} <span>${option.label}</span>`;
      menuItem.addEventListener('click', () => {
        option.action();
        menu.remove();
      });
      menu.appendChild(menuItem);
    });
    
    // Adicionar estilo ao menu
    const style = document.createElement('style');
    style.textContent = `
      .timer-context-menu {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 4px 0;
        min-width: 180px;
      }
      .timer-context-menu-item {
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-family: 'Nunito Sans', sans-serif;
        font-size: 13px;
        color: #33475b;
      }
      .timer-context-menu-item:hover {
        background: #f5f8fa;
      }
      .timer-context-menu-item.danger {
        color: #ff5c35;
      }
      .timer-context-menu-item svg {
        color: #7c98b6;
      }
      .timer-context-menu-item.danger svg {
        color: #ff5c35;
      }
    `;
    document.head.appendChild(style);
    
    // Adicionar o menu ao DOM
    document.body.appendChild(menu);
    
    // Fechar o menu ao clicar fora dele
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    // Pequeno delay para evitar que o próprio evento de clique feche o menu
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
  }
  
  showPhaseDetails(ticketId) {
    const phaseData = this.phaseTimers[ticketId] || {};
    const ticketTitle = this.ticketTitles[ticketId] || `Ticket #${ticketId}`;
    
    // Criar modal para mostrar detalhes
    const modal = document.createElement('div');
    modal.className = 'time-my-ticket-modal';
    
    // Construir conteúdo do modal
    let modalContent = `
      <div class="modal-header">
        <h3>Tempo por Fase: ${ticketTitle}</h3>
        <button class="close-button">&times;</button>
      </div>
      <div class="modal-body">
        <table class="phase-details-table">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Tempo</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // Adicionar cada fase
    let hasFaseData = false;
    this.knownPhases.forEach(phase => {
      const timeInPhase = phaseData[phase] || 0;
      if (timeInPhase > 0) {
        hasFaseData = true;
        modalContent += `
          <tr>
            <td>${phase}</td>
            <td>${this.formatTimeWithSeconds(timeInPhase)}</td>
          </tr>
        `;
      }
    });
    
    // Se não há dados em nenhuma fase
    if (!hasFaseData) {
      modalContent += `
        <tr>
          <td colspan="2" style="text-align: center;">Nenhum dado de fase registrado para este ticket</td>
        </tr>
      `;
    }
    
    // Adicionar tempo total
    modalContent += `
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>${this.formatTimeWithSeconds(this.ticketTimers[ticketId] || 0)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="modal-footer">
        <button class="close-modal-btn">Fechar</button>
        <button class="copy-report-btn">Copiar Relatório</button>
      </div>
    `;
    
    modal.innerHTML = modalContent;
    
    // Adicionar estilo
    const style = document.createElement('style');
    style.textContent = `
      .time-my-ticket-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        width: 90%;
        max-width: 500px;
        z-index: 10001;
        font-family: 'Nunito Sans', sans-serif;
      }
      .time-my-ticket-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #e0e0e0;
      }
      .time-my-ticket-modal h3 {
        margin: 0;
        font-size: 18px;
        color: #33475b;
      }
      .time-my-ticket-modal .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #7c98b6;
      }
      .time-my-ticket-modal .modal-body {
        padding: 16px;
        max-height: 60vh;
        overflow-y: auto;
      }
      .time-my-ticket-modal .phase-details-table {
        width: 100%;
        border-collapse: collapse;
      }
      .time-my-ticket-modal .phase-details-table th,
      .time-my-ticket-modal .phase-details-table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #f0f0f0;
      }
      .time-my-ticket-modal .phase-details-table th {
        background: #f5f8fa;
        color: #33475b;
        font-weight: 600;
      }
      .time-my-ticket-modal .modal-footer {
        padding: 16px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        border-top: 1px solid #e0e0e0;
      }
      .time-my-ticket-modal button {
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Nunito Sans', sans-serif;
        font-size: 14px;
      }
      .time-my-ticket-modal .close-modal-btn {
        background: #f5f8fa;
        border: 1px solid #cbd6e2;
        color: #33475b;
      }
      .time-my-ticket-modal .copy-report-btn {
        background: #0091ae;
        border: none;
        color: white;
      }
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.4);
        z-index: 10000;
      }
    `;
    document.head.appendChild(style);
    
    // Adicionar backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);
    
    // Adicionar o modal ao DOM
    document.body.appendChild(modal);
    
    // Fechar modal ao clicar em fechar
    const closeModal = () => {
      modal.remove();
      backdrop.remove();
    };
    
    modal.querySelector('.close-button').addEventListener('click', closeModal);
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    
    // Copiar relatório
    modal.querySelector('.copy-report-btn').addEventListener('click', () => {
      this.copyTimeReport(ticketId);
      this.showToast('Relatório copiado para a área de transferência', 'success');
    });
  }
  
  showAddTimeManually(ticketId) {
    const ticketTitle = this.ticketTitles[ticketId] || `Ticket #${ticketId}`;
    const phaseData = this.phaseTimers[ticketId] || {};
    const currentPhase = this.currentPhases[ticketId] || '';
    
    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'time-my-ticket-modal';
    
    // Construir conteúdo do modal
    let modalContent = `
      <div class="modal-header">
        <h3>Adicionar Tempo Manualmente</h3>
        <button class="close-button">&times;</button>
      </div>
      <div class="modal-body">
        <p>Ticket: <strong>${ticketTitle}</strong></p>
        
        <div class="form-group">
          <label for="time-phase-select">Fase:</label>
          <select id="time-phase-select" class="form-control">
            ${this.knownPhases.map(phase => `<option value="${phase}" ${phase === currentPhase ? 'selected' : ''}>${phase}</option>`).join('')}
          </select>
        </div>
        
        <div class="form-group time-inputs">
          <label>Tempo a adicionar:</label>
          <div class="time-input-container">
            <div class="time-input">
              <input type="number" id="hours-input" min="0" value="0" class="form-control">
              <label>horas</label>
            </div>
            <div class="time-input">
              <input type="number" id="minutes-input" min="0" max="59" value="0" class="form-control">
              <label>minutos</label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="close-modal-btn">Cancelar</button>
        <button class="save-time-btn">Adicionar Tempo</button>
      </div>
    `;
    
    modal.innerHTML = modalContent;
    
    // Adicionar estilo
    const style = document.createElement('style');
    style.textContent = `
      .time-my-ticket-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        width: 90%;
        max-width: 400px;
        z-index: 10001;
        font-family: 'Nunito Sans', sans-serif;
      }
      .time-my-ticket-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #e0e0e0;
      }
      .time-my-ticket-modal h3 {
        margin: 0;
        font-size: 18px;
        color: #33475b;
      }
      .time-my-ticket-modal .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #7c98b6;
      }
      .time-my-ticket-modal .modal-body {
        padding: 16px;
      }
      .time-my-ticket-modal .form-group {
        margin-bottom: 16px;
      }
      .time-my-ticket-modal label {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        color: #33475b;
      }
      .time-my-ticket-modal .form-control {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #cbd6e2;
        border-radius: 4px;
        font-size: 14px;
      }
      .time-my-ticket-modal .time-inputs {
        margin-top: 16px;
      }
      .time-my-ticket-modal .time-input-container {
        display: flex;
        gap: 12px;
      }
      .time-my-ticket-modal .time-input {
        flex: 1;
      }
      .time-my-ticket-modal .time-input input {
        text-align: center;
      }
      .time-my-ticket-modal .time-input label {
        text-align: center;
        margin-top: 4px;
        font-size: 12px;
        color: #7c98b6;
      }
      .time-my-ticket-modal .modal-footer {
        padding: 16px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        border-top: 1px solid #e0e0e0;
      }
      .time-my-ticket-modal button {
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Nunito Sans', sans-serif;
        font-size: 14px;
      }
      .time-my-ticket-modal .close-modal-btn {
        background: #f5f8fa;
        border: 1px solid #cbd6e2;
        color: #33475b;
      }
      .time-my-ticket-modal .save-time-btn {
        background: #0091ae;
        border: none;
        color: white;
      }
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.4);
        z-index: 10000;
      }
    `;
    document.head.appendChild(style);
    
    // Adicionar backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);
    
    // Adicionar o modal ao DOM
    document.body.appendChild(modal);
    
    // Fechar modal ao clicar em fechar
    const closeModal = () => {
      modal.remove();
      backdrop.remove();
    };
    
    modal.querySelector('.close-button').addEventListener('click', closeModal);
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    
    // Adicionar tempo ao clicar em Salvar
    modal.querySelector('.save-time-btn').addEventListener('click', () => {
      // Obter valores dos inputs
      const phase = modal.querySelector('#time-phase-select').value;
      const hours = parseInt(modal.querySelector('#hours-input').value) || 0;
      const minutes = parseInt(modal.querySelector('#minutes-input').value) || 0;
      
      // Calcular segundos totais
      const secondsToAdd = hours * 3600 + minutes * 60;
      
      if (secondsToAdd <= 0) {
        this.showToast('Por favor, informe um tempo válido para adicionar', 'error');
        return;
      }
      
      // Adicionar tempo à fase
      this.addTimeToPhase(ticketId, phase, secondsToAdd);
      
      // Fechar o modal
      closeModal();
      
      // Mostrar mensagem de sucesso
      this.showToast(`${this.formatTimeWithSeconds(secondsToAdd)} adicionado à fase "${phase}"`, 'success');
    });
  }
  
  addTimeToPhase(ticketId, phaseName, seconds) {
    console.log(`Adicionando ${seconds} segundos à fase "${phaseName}" do ticket ${ticketId}`);
    
    // Inicializar estruturas se necessário
    if (!this.phaseTimers[ticketId]) {
      this.phaseTimers[ticketId] = {};
    }
    
    // Adicionar tempo à fase específica
    this.phaseTimers[ticketId][phaseName] = (this.phaseTimers[ticketId][phaseName] || 0) + seconds;
    
    // Adicionar ao tempo total do ticket
    this.ticketTimers[ticketId] = (this.ticketTimers[ticketId] || 0) + seconds;
    
    // Salvar no storage
    this.saveToStorage({
      phaseTimers: this.phaseTimers,
      ticketTimers: this.ticketTimers
    });
    
    // Atualizar UI
    this.updateTimerDisplay(ticketId, this.ticketTimers[ticketId]);
  }
  
  copyTimeReport(ticketId) {
    const phaseData = this.phaseTimers[ticketId] || {};
    const ticketTitle = this.ticketTitles[ticketId] || `Ticket #${ticketId}`;
    
    // Construir relatório
    let report = `Tempo Gasto no Ticket: ${ticketTitle}\n`;
    report += `ID: ${ticketId}\n`;
    report += `Fases: `;
    
    // Adicionar tempo por fase
    let hasFaseData = false;
    this.knownPhases.forEach(phase => {
      const timeInPhase = phaseData[phase] || 0;
      if (timeInPhase > 0) {
        hasFaseData = true;
        report += `${phase}: ${this.formatTimeWithHoursAndMinutes(timeInPhase)} `;
      }
    });
    
    if (!hasFaseData) {
      report += "Nenhuma fase com tempo registrado. ";
    }
    
    // Adicionar tempo total
    report += `\nTempo Total: ${this.formatTimeWithHoursAndMinutes(this.ticketTimers[ticketId] || 0)}`;
    
    // Copiar para o clipboard
    navigator.clipboard.writeText(report)
      .then(() => {
        this.showToast('Relatório copiado para a área de transferência', 'success');
      })
      .catch(err => {
        console.error('Erro ao copiar relatório:', err);
        this.showToast('Erro ao copiar relatório', 'error');
      });
  }
  
  confirmResetTimer(ticketId) {
    const ticketTitle = this.ticketTitles[ticketId] || `Ticket #${ticketId}`;
    
    if (confirm(`Tem certeza que deseja resetar o timer do ticket "${ticketTitle}"? Esta ação não pode ser desfeita.`)) {
      // Resetar tempo total
      delete this.ticketTimers[ticketId];
      
      // Resetar tempo por fase
      delete this.phaseTimers[ticketId];
      
      // Manter fase atual, mas resetar o tempo
      if (this.currentPhases[ticketId]) {
        this.lastPhaseChange[ticketId] = new Date().toISOString();
      }
      
      // Se o ticket estava ativo, desativá-lo
      if (this.activeTicket === ticketId) {
        this.activeTicket = null;
        this.timerStartTime = null;
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      
      // Salvar no storage
      this.saveToStorage({
        ticketTimers: this.ticketTimers,
        phaseTimers: this.phaseTimers,
        activeTicket: this.activeTicket,
        timerStartTime: this.timerStartTime ? this.timerStartTime.toISOString() : null,
        lastPhaseChange: this.lastPhaseChange
      });
      
      // Atualizar UI
      this.updateTimerDisplay(ticketId, 0);
      this.updateTimerActiveState(ticketId, false);
      
      this.showToast(`Timer do ticket "${ticketTitle}" foi resetado`, 'success');
    }
  }
  
  toggleTimer(ticketId) {
    console.log(`Toggle timer para o ticket: ${ticketId}`);
    
    // Se o ticket clicado já está ativo, pausa o timer
    if (this.activeTicket === ticketId) {
      this.pauseTimer();
      this.showToast('Timer pausado', 'info');
    } else {
      // Se outro timer está ativo, pausa-o primeiro
      if (this.activeTicket) {
        this.pauseTimer();
      }
      
      // Inicia o timer para o novo ticket
      this.startTimer(ticketId);
      this.showToast('Timer iniciado', 'success');
    }
  }
  
  startTimer(ticketId) {
    console.log(`Iniciando timer para o ticket: ${ticketId} - ${this.ticketTitles[ticketId] || 'Sem título'}`);
    
    // Define o ticket como ativo
    this.activeTicket = ticketId;
    this.timerStartTime = new Date();
    
    // Inicializa o contador se ainda não existir
    if (!this.ticketTimers[ticketId]) {
      this.ticketTimers[ticketId] = 0;
    }
    
    // Verificar fase atual do ticket
    const ticketCard = document.querySelector(`${this.ticketCardSelector}[${this.ticketIdAttribute}="${ticketId}"]`);
    if (ticketCard) {
      const column = ticketCard.closest('[data-test-id="cdb-column"]');
      if (column) {
        const phaseNameElement = column.querySelector(this.phaseNameSelector);
        if (phaseNameElement) {
          const phaseName = phaseNameElement.textContent.trim();
          console.log(`Ticket ${ticketId} está na fase "${phaseName}"`);
          
          // Atualizar fase atual e timestamp
          if (this.currentPhases[ticketId] !== phaseName) {
            console.log(`Atualizando fase do ticket para "${phaseName}"`);
            this.handlePhaseChange(ticketId, phaseName);
          } else {
            // Apenas atualiza o timestamp da última mudança
            this.lastPhaseChange[ticketId] = this.timerStartTime.toISOString();
          }
        }
      }
    }
    
    // Salva o estado atual
    this.saveToStorage({
      activeTicket: this.activeTicket,
      timerStartTime: this.timerStartTime.toISOString(),
      ticketTimers: this.ticketTimers,
      currentPhases: this.currentPhases,
      lastPhaseChange: this.lastPhaseChange
    });
    
    // Atualiza a UI
    this.updateTimerUI();
    
    // Inicia o intervalo para atualizar a UI a cada segundo
    this.timerInterval = setInterval(() => this.updateTimerUI(), 1000);
  }
  
  
  // Replace with enhanced version:
pauseTimer() {
  if (!this.activeTicket || !this.timerStartTime) return;
  
  console.log(`Pausando timer para o ticket: ${this.activeTicket} - ${this.ticketTitles[this.activeTicket] || 'Sem título'}`);
  
  // Calcular o tempo decorrido
  const elapsedTime = Math.floor((new Date() - this.timerStartTime) / 1000);
  console.log(`Tempo decorrido: ${this.formatTimeWithSeconds(elapsedTime)}`);
  
  // Adiciona o tempo decorrido ao total do ticket
  this.ticketTimers[this.activeTicket] = (this.ticketTimers[this.activeTicket] || 0) + elapsedTime;
  console.log(`Tempo total do ticket atualizado: ${this.formatTimeWithSeconds(this.ticketTimers[this.activeTicket])}`);
  
  // Adicionar o tempo à fase atual, se houver
  const currentPhase = this.currentPhases[this.activeTicket];
  if (currentPhase) {
    console.log(`Adicionando tempo à fase atual: ${currentPhase}`);
    
    // Inicializar estrutura se necessário
    if (!this.phaseTimers[this.activeTicket]) {
      this.phaseTimers[this.activeTicket] = {};
    }
    
    // Adicionar tempo à fase atual
    this.phaseTimers[this.activeTicket][currentPhase] = 
      (this.phaseTimers[this.activeTicket][currentPhase] || 0) + elapsedTime;
    
    console.log(`Tempo na fase "${currentPhase}" atualizado: ${this.formatTimeWithSeconds(this.phaseTimers[this.activeTicket][currentPhase])}`);
  } else {
    console.warn(`Ticket ${this.activeTicket} não tem uma fase atual definida. O tempo não foi atribuído a nenhuma fase.`);
  }
  
  // Limpa o timer ativo
  clearInterval(this.timerInterval);
  this.timerInterval = null;
  
  // Atualiza o estado
  const oldActiveTicket = this.activeTicket;
  this.activeTicket = null;
  this.timerStartTime = null;
  
  // Salva o estado atual
  this.saveToStorage({
    activeTicket: this.activeTicket,
    timerStartTime: null,
    ticketTimers: this.ticketTimers,
    phaseTimers: this.phaseTimers
  });
  
  // Atualiza a UI
  this.updateTimerDisplay(oldActiveTicket, this.ticketTimers[oldActiveTicket]);
  this.updateTimerActiveState(oldActiveTicket, false);
  
  // Executar detecção de fases para garantir que todos os dados estão atualizados
  setTimeout(() => this.detectAndTrackPhases(), 500);
}
  
  resumeActiveTimer() {
    // Se um timer estava ativo quando a página foi carregada, retoma a contagem
    if (this.activeTicket && this.timerStartTime) {
      console.log(`Retomando timer para o ticket: ${this.activeTicket}`);
      this.updateTimerUI();
      this.timerInterval = setInterval(() => this.updateTimerUI(), 1000);
      this.showToast('Timer retomado automaticamente', 'info');
    }
  }
  
  updateTimerUI() {
    if (!this.activeTicket || !this.timerStartTime) return;
    
    // Calcular tempo total (acumulado + atual)
    const accumulated = this.ticketTimers[this.activeTicket] || 0;
    const current = Math.floor((new Date() - this.timerStartTime) / 1000);
    const totalSeconds = accumulated + current;
    
    // Atualizar a exibição do timer
    this.updateTimerDisplay(this.activeTicket, totalSeconds);
    
    // Garantir que o estado ativo esteja correto
    this.updateTimerActiveState(this.activeTicket, true);
  }
  
  updateTimerDisplay(ticketId, seconds) {
    // Encontra todos os displays de timer para este ticket
    const cards = document.querySelectorAll(this.ticketCardSelector);
    
    cards.forEach(card => {
      if (card.getAttribute(this.ticketIdAttribute) === ticketId) {
        const timerIcon = card.querySelector('.ticket-timer-icon');
        if (timerIcon) {
          // Garantir que está expandido para mostrar o tempo
          if (!timerIcon.classList.contains('expanded')) {
            timerIcon.classList.add('expanded');
            timerIcon.classList.remove('minimized');
          }
          
          const timerDisplay = timerIcon.querySelector('.timer-display');
          if (timerDisplay) {
            timerDisplay.textContent = this.formatTimeWithSeconds(seconds);
          }
        }
      }
    });
  }
  
  updateTimerActiveState(ticketId, isActive) {
    // Atualiza o estado visual (ativo/inativo) de todos os ícones de timer
    const cards = document.querySelectorAll(this.ticketCardSelector);
    
    cards.forEach(card => {
      const cardTicketId = card.getAttribute(this.ticketIdAttribute);
      const timerIcon = card.querySelector('.ticket-timer-icon');
      
      if (timerIcon) {
        // Atualiza o tooltip
        timerIcon.setAttribute('data-tooltip', 
          cardTicketId === ticketId && isActive ? 'Pausar cronômetro' : 'Iniciar cronômetro'
        );
        
        if (cardTicketId === ticketId) {
          // Atualiza o estado ativo/inativo
          if (isActive) {
            timerIcon.classList.add('active');
            timerIcon.classList.add('expanded');
            timerIcon.classList.remove('minimized');
          } else {
            timerIcon.classList.remove('active');
            
            // Verifica se deve manter expandido (se tiver tempo acumulado)
            const hasTime = this.ticketTimers[ticketId] && this.ticketTimers[ticketId] > 0;
            if (!hasTime) {
              timerIcon.classList.remove('expanded');
              timerIcon.classList.add('minimized');
            }
          }
        } else {
          // Garante que outros timers não estejam ativos
          timerIcon.classList.remove('active');
        }
      }
    });
  }
  
  formatTimeWithSeconds(seconds) {
    // Formata o tempo em hh:mm:ss
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  formatTimeWithHoursAndMinutes(seconds) {
    // Formata o tempo em formato mais amigável: 2h 30min
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
  
  showToast(message, type = 'info') {
    // Cria o elemento toast se ainda não existir
    let toast = document.getElementById('ticket-timer-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ticket-timer-toast';
      document.body.appendChild(toast);
    }
    
    // Define a classe de estilo com base no tipo
    toast.className = `ticket-timer-toast ${type}`;
    toast.textContent = message;
    
    // Mostra o toast
    toast.classList.add('show');
    
    // Remove após 3 segundos
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
  
  addToastStyles() {
    if (!document.getElementById('ticket-timer-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'ticket-timer-toast-styles';
      style.textContent = `
        .ticket-timer-toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 10px 16px;
          border-radius: 4px;
          color: white;
          font-family: "Nunito Sans", sans-serif;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
          z-index: 10000;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.3s ease;
        }
        
        .ticket-timer-toast.show {
          opacity: 1;
          transform: translateY(0);
        }
        
        .ticket-timer-toast.success {
          background-color: #00bda5;
        }
        
        .ticket-timer-toast.info {
          background-color: #0091ae;
        }
        
        .ticket-timer-toast.warning {
          background-color: #ffab00;
        }
        
        .ticket-timer-toast.error {
          background-color: #ff5c35;
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Método para extrair informações dos tickets diretamente do DOM
  getTicketInfo(ticketId) {
    const cards = document.querySelectorAll(this.ticketCardSelector);
    
    // Valores padrão
    let ticketInfo = {
      id: ticketId,
      title: this.ticketTitles[ticketId] || `Ticket #${ticketId}`,
      owner: 'Desconhecido',
      status: 'Desconhecido',
      cda: 'Não informado',
      timeInPhases: this.phaseTimers[ticketId] || {}
    };
    
    cards.forEach(card => {
      if (card.getAttribute(this.ticketIdAttribute) === ticketId) {
        // Extrair título do ticket
        const titleElement = card.querySelector('[data-test-id="cdbc-title"] span span:last-child');
if (titleElement) {
  ticketInfo.title = titleElement.textContent.trim();
  // Atualiza o título no storage
  this.ticketTitles[ticketId] = ticketInfo.title;
  this.saveToStorage({ ticketTitles: this.ticketTitles });
}
        
        // Extrair proprietário do ticket - tentando vários seletores possíveis
        const ownerElements = [
          card.querySelector('[data-test-id="cdbc-property-0"] [data-test-id="cdbc-property-value"] span'),
          card.querySelector('[data-selenium-test="card-property"] span[data-test-id="cdbc-property-value"] span'),
          card.querySelector('.DefaultProperties__CardFieldHeader-sc-145amcu-0 + span span')
        ];
        
        for (const elem of ownerElements) {
          if (elem && elem.textContent) {
            ticketInfo.owner = elem.textContent.trim();
            break;
          }
        }
        
        // Extrair CDA responsável - tentando vários seletores
        const cdaElements = card.querySelectorAll('[data-test-id="cdbc-property"] [data-test-id="cdbc-property-label"]');
        for (let i = 0; i < cdaElements.length; i++) {
          const label = cdaElements[i];
          if (label.textContent.includes('CDA Responsável')) {
            const cdaValueElement = label.parentElement.querySelector('[data-test-id="cdbc-property-value"] span');
            if (cdaValueElement) {
              ticketInfo.cda = cdaValueElement.textContent.trim();
            }
            break;
          }
        }
        
        // Extrair status do ticket (coluna atual)
        const columnElement = card.closest('[data-test-id="cdb-column"]');
        if (columnElement) {
          const columnNameElement = columnElement.querySelector(this.phaseNameSelector);
          if (columnNameElement) {
            ticketInfo.status = columnNameElement.textContent.trim();
          }
        }
      }
    });
    
    return ticketInfo;
  }
  
  // Método para exportar relatório detalhado
  exportTimerReport() {
    // Preparar cabeçalho do CSV
    let csvContent = "ID do Ticket,Título,Proprietário,CDA Responsável,Status,Tempo Total";
    
    // Adicionar colunas para cada fase conhecida
    this.knownPhases.forEach(phase => {
      csvContent += `,Tempo em ${phase}`;
    });
    
    csvContent += "\n";
    
    // Adicionar cada ticket com informações
    for (const ticketId in this.ticketTimers) {
      const seconds = this.ticketTimers[ticketId];
      const ticketInfo = this.getTicketInfo(ticketId);
      const phaseData = this.phaseTimers[ticketId] || {};
      
      // Calcular tempo total (incluindo o atual se estiver ativo)
      let totalSeconds = seconds;
      if (ticketId === this.activeTicket && this.timerStartTime) {
        const elapsedSeconds = Math.floor((new Date() - this.timerStartTime) / 1000);
        totalSeconds += elapsedSeconds;
      }
      
      // Sanitizar campos para evitar problemas com CSV
      const sanitizedTitle = ticketInfo.title.replace(/,/g, ' ');
      const sanitizedOwner = ticketInfo.owner.replace(/,/g, ' ');
      const sanitizedCDA = ticketInfo.cda.replace(/,/g, ' ');
      const sanitizedStatus = ticketInfo.status.replace(/,/g, ' ');
      
      // Adicionar linha com dados básicos
      csvContent += `${ticketId},"${sanitizedTitle}","${sanitizedOwner}","${sanitizedCDA}","${sanitizedStatus}",${this.formatTimeWithSeconds(totalSeconds)}`;
      
      // Adicionar tempo em cada fase
      this.knownPhases.forEach(phase => {
        const timeInPhase = phaseData[phase] || 0;
        csvContent += `,${this.formatTimeWithSeconds(timeInPhase)}`;
      });
      
      csvContent += "\n";
    }
    
    // Fazer download do CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Se estamos em uma extensão, usamos a API de mensagens para solicitar o download
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'saveReportData',
        csvContent: csvContent
      }, (response) => {
        if (response && response.success) {
          this.showToast('Relatório exportado com sucesso!', 'success');
        } else {
          this.showToast('Erro ao exportar relatório', 'error');
        }
      });
    } else {
      // Fallback para download direto se não estiver em uma extensão
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `timeMyTicket-relatorio-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Relatório exportado com sucesso!', 'success');
    }
  }
}

// Inicializa a extensão quando o DOM estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    console.log('Iniciando TimeMyTicket após DOMContentLoaded');
    window.ticketTimer = new TicketTimer();
  }, 1000); // Aguarda 1 segundo para garantir que o HubSpot carregou completamente
});

// Também inicia após um curto delay para garantir que funcione mesmo se
// o evento DOMContentLoaded já tiver ocorrido
setTimeout(() => {
  if (!window.ticketTimer) {
    console.log('Iniciando TimeMyTicket após timeout');
    window.ticketTimer = new TicketTimer();
  }
}, 1500);

// Ouvir mensagens do background script e popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Exportar relatório
    if (request.action === 'exportTimerReport' && window.ticketTimer) {
      window.ticketTimer.exportTimerReport();
      sendResponse({ success: true });
    }

        // Apply color settings
        if (request.action === 'applyColorSettings' && window.ticketTimer) {
          window.ticketTimer.applyColorSettings();
          sendResponse({ success: true });
        }
    
    // Obter informações de um ticket específico
    if (request.action === 'getTicketInfo' && window.ticketTimer) {
      const ticketInfo = window.ticketTimer.getTicketInfo(request.ticketId);
      sendResponse({ success: true, ticketInfo: ticketInfo });
    }
    
    // Pausar timer
    if (request.action === 'pauseTimer' && window.ticketTimer) {
      window.ticketTimer.pauseTimer();
      sendResponse({ success: true });
    }
    
    // Adicionar tempo a uma fase manualmente
    if (request.action === 'addTimeToPhase' && window.ticketTimer) {
      window.ticketTimer.addTimeToPhase(request.ticketId, request.phase, request.seconds);
      sendResponse({ success: true });
    }
    
    // Refresh timers
    if (request.action === 'refreshTimers' && window.ticketTimer) {
      window.ticketTimer.processExistingCards();
      window.ticketTimer.detectAndTrackPhases();
      sendResponse({ success: true });
    }
    
    // Mostrar toast de notificação
    if (request.action === 'showToast' && window.ticketTimer) {
      window.ticketTimer.showToast(request.message, request.type || 'info');
      sendResponse({ success: true });
    }
    
    return true;
  });
}

TicketTimer.prototype.applyColorSettings = function() {
  // Get color settings from localStorage
  const savedSettings = localStorage.getItem('timeMyTicket_colorSettings');
  if (!savedSettings) return;
  
  try {
    const settings = JSON.parse(savedSettings);
    this.applyColorHighlights(settings);
  } catch (e) {
    console.error('Error parsing color settings:', e);
  }
};

// Apply color highlighting to cards based on settings
TicketTimer.prototype.applyColorHighlights = function(settings) {
  console.log('Applying color highlights with settings:', settings);
  
  // Find all ticket cards
  const cards = document.querySelectorAll(this.ticketCardSelector);
  
  cards.forEach(card => {
    // Remove existing highlight classes
    card.classList.remove('ticket-highlight', 'lane-highlight-entregues', 'lane-highlight-dispensados', 'lane-highlight-impedidos', 'owner-highlight');
    card.style.removeProperty('--highlight-color');
    
    // Get ticket ID and info
    const ticketId = card.getAttribute(this.ticketIdAttribute);
    if (!ticketId) return;
    
    // Get ticket information
    const ticketInfo = this.getTicketInfo(ticketId);
    
    // First check for lane-based highlighting
    const column = card.closest('[data-test-id="cdb-column"]');
    if (column) {
      const phaseNameElement = column.querySelector(this.phaseNameSelector);
      if (phaseNameElement) {
        const phaseName = phaseNameElement.textContent.trim();
        
        // Check if this is a highlighted lane
        if (phaseName === 'Entregues' && settings.lanes['Entregues']) {
          card.classList.add('ticket-highlight', 'lane-highlight-entregues');
          card.style.setProperty('--highlight-color', settings.lanes['Entregues']);
        } else if (phaseName === 'Dispensados' && settings.lanes['Dispensados']) {
          card.classList.add('ticket-highlight', 'lane-highlight-dispensados');
          card.style.setProperty('--highlight-color', settings.lanes['Dispensados']);
        } else if (phaseName === 'Impedidos' && settings.lanes['Impedidos']) {
          card.classList.add('ticket-highlight', 'lane-highlight-impedidos');
          card.style.setProperty('--highlight-color', settings.lanes['Impedidos']);
        }
      }
    }
    
    // Then check for owner-based highlighting (only if not already highlighted by lane)
    if (!card.classList.contains('ticket-highlight')) {
      const ownerName = ticketInfo.cda || '';
      
      // Check predefined owners
      if (settings.owners[ownerName]) {
        card.classList.add('ticket-highlight', 'owner-highlight');
        card.style.setProperty('--highlight-color', settings.owners[ownerName]);
      } 
      // Check custom owners
      else if (settings.customOwners) {
        // Check for exact match
        if (settings.customOwners[ownerName]) {
          card.classList.add('ticket-highlight', 'owner-highlight');
          card.style.setProperty('--highlight-color', settings.customOwners[ownerName]);
        } 
        // Check for partial matches (for email addresses)
        else {
          for (const [name, color] of Object.entries(settings.customOwners)) {
            if (ownerName.toLowerCase().includes(name.toLowerCase()) || 
                name.toLowerCase().includes(ownerName.toLowerCase())) {
              card.classList.add('ticket-highlight', 'owner-highlight');
              card.style.setProperty('--highlight-color', color);
              break;
            }
          }
        }
      }
    }
  });
  
  console.log('Color highlights applied');
};

TicketTimer.prototype.injectHighlightStyles = function() {
  const style = document.createElement('style');
  style.id = 'ticket-timer-highlight-styles';
  style.textContent = `
    /* Base highlight style for tickets */
    .ticket-highlight {
      position: relative;
    }
    
    .ticket-highlight::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      z-index: 1;
    }
    
    /* Highlight styles for lanes */
    .lane-highlight-entregues::before {
      background-color: var(--highlight-color, #00bda5);
    }
    
    .lane-highlight-dispensados::before {
      background-color: var(--highlight-color, #ff5c35);
    }
    
    .lane-highlight-impedidos::before {
      background-color: var(--highlight-color, #ffab00);
    }
    
    /* Highlight style for owners */
    .owner-highlight::before {
      background-color: var(--highlight-color);
    }
    
    /* Optional: Add a subtle background color to the ticket */
    .ticket-highlight {
      background-color: rgba(var(--highlight-color-rgb, 255, 255, 255), 0.05);
    }
    
    /* Hover effect enhancement */
    .ticket-highlight:hover::before {
      width: 6px;
      transition: width 0.2s ease;
    }
  `;
  document.head.appendChild(style);
};

// Helper function to convert hex to RGB (add to TicketTimer prototype)
TicketTimer.prototype.hexToRgb = function(hex) {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `${r}, ${g}, ${b}`;
};