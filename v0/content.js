// Arquivo content.js - Evolução para rastreamento de tempo por fase

class TicketTimer {
  constructor() {
    // Estado do sistema
    this.ticketTimers = {}; // Objeto que armazena o tempo acumulado por ticket
    this.ticketPhases = {}; // Objeto que armazena os tempos por fase para cada ticket
    this.activeTicket = null; // ID do ticket atualmente sendo cronometrado
    this.timerStartTime = null; // Timestamp de quando o timer atual começou
    this.timerInterval = null; // Referência para o setInterval que atualiza o timer
    this.ticketTitles = {}; // Armazena os títulos dos tickets para melhor UX
    this.ticketData = {}; // Armazena dados persistentes dos tickets (proprietário, CDA, status atual)
    this.phaseHistory = {}; // Histórico de fases por ticket
    
    // Configurações específicas para o HubSpot baseadas no DOM analisado
    this.ticketCardSelector = '[data-test-id="cdb-column-item"]'; // Seletor para cards de tickets
    this.ticketIdAttribute = 'data-selenium-id'; // Atributo que contém o ID do ticket
    this.attemptCount = 0; // Contador para tentativas de processamento
    
    // Inicializar observador de DOM assim que a classe for instanciada
    this.init();
  }
  
  async init() {
    console.log('Iniciando TimeMyTicket com rastreamento de fases...');
    
    // Carrega dados do localStorage
    await this.loadDataFromStorage();
    
    // Adiciona estilos globais para notificações de toast
    this.addToastStyles();
    
    // Inicializa observador de DOM para detectar novos cards
    this.initMutationObserver();
    
    // Inicializa observador para detectar mudanças de fase (arrastar cards)
    this.initPhaseMutationObserver();
    
    // Processar inicialmente com uma pequena espera para garantir que o DOM esteja carregado
    setTimeout(() => {
      this.processExistingCards();
      
      // Se havia um timer ativo, retoma a contagem
      if (this.activeTicket && this.timerStartTime) {
        this.resumeActiveTimer();
      }
    }, 1500);
    
    // Tentar novamente em intervalos para pegar elementos carregados dinamicamente
    this.startRetryProcessor();
  }
  
  startRetryProcessor() {
    // Tenta processar os cards várias vezes nos primeiros minutos após o carregamento
    const retryIntervals = [3000, 5000, 10000, 15000, 30000, 60000];
    
    const processorInterval = setInterval(() => {
      this.attemptCount++;
      console.log(`Tentativa ${this.attemptCount} de processar cards`);
      this.processExistingCards();
      
      if (this.attemptCount >= retryIntervals.length) {
        clearInterval(processorInterval);
        console.log('Finalizadas tentativas programadas de processamento de cards');
      }
    }, retryIntervals[this.attemptCount]);
  }
  
  async loadDataFromStorage() {
    // Carrega dados do localStorage
    const data = await this.getFromStorage([
      'ticketTimers',
      'activeTicket',
      'timerStartTime',
      'ticketTitles',
      'ticketData',
      'ticketPhases',
      'phaseHistory'
    ]);
    
    this.ticketTimers = data.ticketTimers || {};
    this.activeTicket = data.activeTicket || null;
    this.timerStartTime = data.timerStartTime ? new Date(data.timerStartTime) : null;
    this.ticketTitles = data.ticketTitles || {};
    this.ticketData = data.ticketData || {};
    this.ticketPhases = data.ticketPhases || {};
    this.phaseHistory = data.phaseHistory || {};
    
    console.log('Dados carregados:', { 
      ticketsMonitorados: Object.keys(this.ticketTimers).length,
      ticketAtivo: this.activeTicket,
      fasesRegistradas: Object.keys(this.ticketPhases).length
    });
  }
  
  getFromStorage(keys) {
    return new Promise(resolve => {
      // Tenta usar o storage da extensão primeiro
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(keys, resolve);
      } else {
        // Fallback para localStorage
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
    // Salva no storage da extensão se disponível
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(data);
    } else {
      // Fallback para localStorage
      Object.keys(data).forEach(key => {
        localStorage.setItem(`hubspot_timer_${key}`, JSON.stringify(data[key]));
      });
    }
    console.log('Dados salvos:', data);
  }
  
  initMutationObserver() {
    // Configura um MutationObserver para detectar quando novos cards são adicionados
    const observer = new MutationObserver((mutations) => {
      let shouldProcessCards = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          const cardAdded = Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Verifica se o nó é um card ou contém um card
              return node.matches?.(this.ticketCardSelector) || 
                node.querySelector?.(this.ticketCardSelector);
            }
            return false;
          });
          
          if (cardAdded) {
            shouldProcessCards = true;
          }
        }
      });
      
      if (shouldProcessCards) {
        setTimeout(() => {
          console.log('Detectada adição de cards, processando...');
          this.processExistingCards();
        }, 500); // Pequeno delay para garantir que o DOM esteja estável
      }
    });
    
    // Inicia a observação no body do documento
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('MutationObserver iniciado para novos cards');
  }
  
  initPhaseMutationObserver() {
    // Observa mudanças nas colunas para detectar movimentação de tickets entre fases
    const phaseObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        // Verificar se é uma mudança em uma coluna (fase)
        if (mutation.type === 'childList' && 
            (mutation.target.matches('[data-test-id="cdb-column-body"]') || 
             mutation.target.closest('[data-test-id="cdb-column-body"]'))) {
          
          // Se novos nós foram adicionados, significa que um ticket foi movido para esta coluna
          if (mutation.addedNodes.length > 0) {
            Array.from(mutation.addedNodes).forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE && 
                  (node.matches(this.ticketCardSelector) || 
                   node.querySelector?.(this.ticketCardSelector))) {
                
                const ticketCard = node.matches(this.ticketCardSelector) ? 
                                   node : node.querySelector(this.ticketCardSelector);
                
                if (ticketCard) {
                  const ticketId = ticketCard.getAttribute(this.ticketIdAttribute);
                  if (ticketId) {
                    // Obter a coluna/fase atual
                    const columnElement = ticketCard.closest('[data-test-id="cdb-column"]');
                    if (columnElement) {
                      const columnNameElement = columnElement.querySelector('[data-test-id="cdb-column-name"]');
                      if (columnNameElement) {
                        const currentPhase = columnNameElement.textContent.trim();
                        
                        // Registrar a mudança de fase
                        this.recordPhaseChange(ticketId, currentPhase);
                      }
                    }
                  }
                }
              }
            });
          }
        }
      });
    });
    
    // Observe todas as colunas/fases
    const columns = document.querySelectorAll('[data-test-id="cdb-column-body"]');
    columns.forEach(column => {
      phaseObserver.observe(column, {
        childList: true,
        subtree: true
      });
    });
    
    // Observe também o container principal para detectar novas colunas que possam ser adicionadas
    const columnsContainer = document.querySelector('[data-test-id="cdb-columns-container"]');
    if (columnsContainer) {
      phaseObserver.observe(columnsContainer, {
        childList: true,
        subtree: true
      });
    }
    
    console.log('MutationObserver iniciado para mudanças de fase');
  }
  
  recordPhaseChange(ticketId, newPhase) {
    console.log(`Ticket ${ticketId} movido para a fase: ${newPhase}`);
    
    // Inicializa o histórico do ticket se não existir
    if (!this.phaseHistory[ticketId]) {
      this.phaseHistory[ticketId] = [];
    }
    
    // Inicializa os dados do ticket se não existirem
    if (!this.ticketData[ticketId]) {
      this.ticketData[ticketId] = this.getTicketInfo(ticketId);
    }
    
    // Inicializa os tempos por fase do ticket se não existirem
    if (!this.ticketPhases[ticketId]) {
      this.ticketPhases[ticketId] = {};
    }
    
    // Obtém a fase anterior do ticket (se existir)
    const ticketInfo = this.ticketData[ticketId];
    const previousPhase = ticketInfo.status;
    
    // Se o ticket mudou de fase e tinha uma fase anterior
    if (previousPhase && previousPhase !== newPhase) {
      // Registra o fim do tempo na fase anterior
      const now = new Date();
      
      // Se o ticket está ativo, calcula o tempo até agora
      if (this.activeTicket === ticketId && this.timerStartTime) {
        const elapsedTime = Math.floor((now - this.timerStartTime) / 1000);
        
        // Adiciona o tempo decorrido à fase anterior
        if (!this.ticketPhases[ticketId][previousPhase]) {
          this.ticketPhases[ticketId][previousPhase] = 0;
        }
        this.ticketPhases[ticketId][previousPhase] += elapsedTime;
        
        // Reinicia o timer para a nova fase
        this.timerStartTime = now;
      }
      
      // Adiciona a transição ao histórico
      this.phaseHistory[ticketId].push({
        from: previousPhase,
        to: newPhase,
        timestamp: now.toISOString(),
        seconds: this.ticketPhases[ticketId][previousPhase] || 0
      });
      
      console.log(`Fase alterada de ${previousPhase} para ${newPhase}`);
    }
    
    // Atualiza o status atual do ticket
    this.ticketData[ticketId].status = newPhase;
    
    // Salva os dados atualizados
    this.saveToStorage({
      ticketData: this.ticketData,
      ticketPhases: this.ticketPhases,
      phaseHistory: this.phaseHistory
    });
    
    // Mostra uma notificação sobre a mudança de fase
    this.showToast(`Ticket movido para ${newPhase}`, 'info');
  }
  
  processExistingCards() {
    // Encontra todos os cards de ticket na página atual
    const cards = document.querySelectorAll(this.ticketCardSelector);
    console.log(`Processando ${cards.length} cards encontrados`);
    
    cards.forEach(card => {
      // Verifica se o card já foi processado
      if (!card.querySelector('.ticket-timer-icon')) {
        this.addTimerToCard(card);
      }
      
      // Atualiza os dados do ticket
      const ticketId = card.getAttribute(this.ticketIdAttribute);
      if (ticketId) {
        // Captura o status atual do ticket
        const columnElement = card.closest('[data-test-id="cdb-column"]');
        if (columnElement) {
          const columnNameElement = columnElement.querySelector('[data-test-id="cdb-column-name"]');
          if (columnNameElement) {
            const currentPhase = columnNameElement.textContent.trim();
            
            // Atualiza o status e outras informações do ticket
            if (!this.ticketData[ticketId] || this.ticketData[ticketId].status !== currentPhase) {
              const ticketInfo = this.getTicketInfo(ticketId);
              
              // Se já existe um registro para este ticket, preserva alguns dados
              if (this.ticketData[ticketId]) {
                ticketInfo.firstSeen = this.ticketData[ticketId].firstSeen;
              } else {
                // Se é a primeira vez que vemos este ticket, registra o timestamp
                ticketInfo.firstSeen = new Date().toISOString();
              }
              
              this.ticketData[ticketId] = ticketInfo;
              
              // Se é uma mudança de fase, registra
              if (this.ticketData[ticketId] && this.ticketData[ticketId].status !== currentPhase) {
                this.recordPhaseChange(ticketId, currentPhase);
              }
              
              // Salva os dados atualizados
              this.saveToStorage({
                ticketData: this.ticketData
              });
            }
          }
        }
      }
    });
  }
  
  addTimerToCard(card) {
    // Obtém o ID do ticket do atributo data-selenium-id
    const ticketId = card.getAttribute(this.ticketIdAttribute);
    if (!ticketId) {
      console.warn('Card sem ID de ticket:', card);
      return;
    }
    
    // Captura o título do ticket
    const titleElement = card.querySelector('[data-test-id="cdbc-title"] span.TitleProperty__TwoLines-sc-1hhc36h-0 span');
    const ticketTitle = titleElement ? titleElement.textContent.trim() : `Ticket #${ticketId}`;
    
    // Armazena o título do ticket para uso posterior
    this.ticketTitles[ticketId] = ticketTitle;
    this.saveToStorage({ ticketTitles: this.ticketTitles });
    
    // Verificar se este ticket já tem tempo acumulado
    const hasTime = this.ticketTimers[ticketId] && this.ticketTimers[ticketId] > 0;
    const isActive = this.activeTicket === ticketId;
    
    // Encontrar o melhor local para inserir o timer
    // Tentativa 1: No container de título
    let titleContainer = card.querySelector('.Card__StyledTitleContainer-sc-1o9oolf-0');
    
    // Tentativa 2: Na parte superior do card
    if (!titleContainer) {
      titleContainer = card.querySelector('.Card__StyledHoverContainer-sc-1o9oolf-1');
    }
    
    // Tentativa 3: Qualquer elemento dentro do card que possa servir como container
    if (!titleContainer) {
      titleContainer = card.querySelector('div[class*="StyledContainer"]') || 
                     card.querySelector('div[class*="Container"]');
    }
    
    // Se ainda não encontrou um lugar adequado, usa o próprio card
    if (!titleContainer) {
      console.warn(`Não foi possível encontrar um container adequado para o timer no ticket ${ticketId}. Usando o próprio card.`);
      titleContainer = card;
    }
    
    // Obter informações de fases
    let phasesInfo = '';
    if (this.ticketPhases[ticketId]) {
      const phases = Object.keys(this.ticketPhases[ticketId]);
      if (phases.length > 0) {
        phasesInfo = `Rastreando ${phases.length} fase(s)`;
      }
    }
    
    // Cria o elemento do ícone do timer com tooltip dinâmico
    const timerIcon = document.createElement('div');
    timerIcon.className = `ticket-timer-icon ${hasTime || isActive ? 'expanded' : 'minimized'} ${isActive ? 'active' : ''}`;
    timerIcon.setAttribute('data-tooltip', isActive ? 'Pausar cronômetro' : 'Iniciar cronômetro');
    timerIcon.setAttribute('data-ticket-id', ticketId);
    
    // Se o ticket tem fases registradas, adiciona informação ao tooltip
    if (phasesInfo) {
      timerIcon.setAttribute('data-tooltip-phases', phasesInfo);
    }
    
    timerIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
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
    
    // Inicializa o registro de tempo por fase se necessário
    if (!this.ticketPhases[ticketId]) {
      this.ticketPhases[ticketId] = {};
    }
    
    // Atualiza os dados do ticket se não existirem
    if (!this.ticketData[ticketId]) {
      this.ticketData[ticketId] = this.getTicketInfo(ticketId);
      this.ticketData[ticketId].firstSeen = new Date().toISOString();
    }
    
    // Inicializa o histórico do ticket se não existir
    if (!this.phaseHistory[ticketId]) {
      this.phaseHistory[ticketId] = [];
    }
    
    // Registra o início da contagem na fase atual
    const currentPhase = this.ticketData[ticketId].status;
    if (currentPhase && this.phaseHistory[ticketId].length === 0) {
      // Se é a primeira vez que iniciamos o timer para este ticket, registramos o início da fase
      this.phaseHistory[ticketId].push({
        from: null,
        to: currentPhase,
        timestamp: this.timerStartTime.toISOString(),
        seconds: 0
      });
    }
    
    // Salva o estado atual
    this.saveToStorage({
      activeTicket: this.activeTicket,
      timerStartTime: this.timerStartTime.toISOString(),
      ticketTimers: this.ticketTimers,
      ticketPhases: this.ticketPhases,
      ticketData: this.ticketData,
      phaseHistory: this.phaseHistory
    });
    
    // Atualiza a UI
    this.updateTimerUI();
    
    // Inicia o intervalo para atualizar a UI a cada segundo
    this.timerInterval = setInterval(() => this.updateTimerUI(), 1000);
  }
  
  pauseTimer() {
    if (!this.activeTicket || !this.timerStartTime) return;
    
    console.log(`Pausando timer para o ticket: ${this.activeTicket} - ${this.ticketTitles[this.activeTicket] || 'Sem título'}`);
    
    // Calcula o tempo decorrido
    const now = new Date();
    const elapsedTime = Math.floor((now - this.timerStartTime) / 1000);
    
    // Adiciona o tempo decorrido ao total do ticket
    this.ticketTimers[this.activeTicket] = (this.ticketTimers[this.activeTicket] || 0) + elapsedTime;
    
    // Adiciona o tempo à fase atual
    const currentPhase = this.ticketData[this.activeTicket]?.status;
    if (currentPhase) {
      if (!this.ticketPhases[this.activeTicket][currentPhase]) {
        this.ticketPhases[this.activeTicket][currentPhase] = 0;
      }
      this.ticketPhases[this.activeTicket][currentPhase] += elapsedTime;
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
      ticketPhases: this.ticketPhases
    });
    
    // Atualiza a UI
    this.updateTimerDisplay(oldActiveTicket, this.ticketTimers[oldActiveTicket]);
    this.updateTimerActiveState(oldActiveTicket, false);
  }
  
  resumeActiveTimer() {
    // Se um timer estava ativo quando a página foi carregada, retoma a contagem
    if (this.activeTicket && this.timerStartTime) {
      console.log(`Retomando timer para o ticket: ${this.activeTicket} - ${this.ticketTitles[this.activeTicket] || 'Sem título'}`);
      this.updateTimerUI();
      this.timerInterval = setInterval(() => this.updateTimerUI(), 1000);
      this.showToast('Timer retomado automaticamente', 'info');
    }
  }
  
  updateTimerUI() {
    if (!this.activeTicket || !this.timerStartTime) return;
    
    // Calcula o tempo total (acumulado + atual)
    const accumulated = this.ticketTimers[this.activeTicket] || 0;
    const current = Math.floor((new Date() - this.timerStartTime) / 1000);
    const totalSeconds = accumulated + current;
    
    // Atualiza a exibição do timer
    this.updateTimerDisplay(this.activeTicket, totalSeconds);
    
    // Garante que o estado ativo esteja correto
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
  
  // Método para mostrar notificações toast
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
  
  // Adiciona estilos para as notificações toast
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
      lastUpdated: new Date().toISOString()
    };
    
    cards.forEach(card => {
      if (card.getAttribute(this.ticketIdAttribute) === ticketId) {
        // Extrair título do ticket
        const titleElement = card.querySelector('[data-test-id="cdbc-title"] span.TitleProperty__TwoLines-sc-1hhc36h-0 span');
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
          const columnNameElement = columnElement.querySelector('[data-test-id="cdb-column-name"]');
          if (columnNameElement) {
            ticketInfo.status = columnNameElement.textContent.trim();
          }
        }
      }
    });
    
    return ticketInfo;
  }
  
  // Método para obter o histórico de tempo por fase de um ticket
  getTicketPhaseHistory(ticketId) {
    const history = [];
    
    // Se não existe histórico para este ticket, retorna vazio
    if (!this.ticketPhases[ticketId]) {
      return history;
    }
    
    // Formata o histórico de tempo por fase
    Object.entries(this.ticketPhases[ticketId]).forEach(([phase, seconds]) => {
      history.push({
        fase: phase,
        tempo: this.formatTimeWithSeconds(seconds),
        segundos: seconds
      });
    });
    
    // Ordena o histórico por tempo (do maior para o menor)
    history.sort((a, b) => b.segundos - a.segundos);
    
    return history;
  }
  
  // Método para obter o histórico completo de transições de fase
  getTicketFullHistory(ticketId) {
    // Se não existe histórico, retorna vazio
    if (!this.phaseHistory[ticketId]) {
      return [];
    }
    
    // Formata o histórico de transições
    return this.phaseHistory[ticketId].map(entry => {
      return {
        de: entry.from || "Início",
        para: entry.to,
        data: new Date(entry.timestamp).toLocaleString(),
        tempo: this.formatTimeWithSeconds(entry.seconds)
      };
    });
  }
  
  // Método para formatar o relatório de um ticket
  getTicketReport(ticketId) {
    // Se não temos dados deste ticket, retorna null
    if (!this.ticketData[ticketId]) {
      return null;
    }
    
    // Formata o relatório
    return {
      ticketId: ticketId,
      titulo: this.ticketData[ticketId].title,
      responsavel: this.ticketData[ticketId].owner,
      cda: this.ticketData[ticketId].cda,
      status: this.ticketData[ticketId].status,
      tempoTotal: this.formatTimeWithSeconds(this.ticketTimers[ticketId] || 0),
      historico: this.getTicketPhaseHistory(ticketId),
      transicoes: this.getTicketFullHistory(ticketId)
    };
  }
  
  // Método para exportar relatório detalhado de tempos por fase
  exportTimerReport() {
    // Preparar cabeçalho do CSV
    let csvContent = "ID do Ticket,Título,Proprietário,CDA Responsável,Status Atual,Tempo Total";
    
    // Descobrir todas as fases existentes em todos os tickets
    const allPhases = new Set();
    Object.keys(this.ticketPhases).forEach(ticketId => {
      Object.keys(this.ticketPhases[ticketId]).forEach(phase => {
        allPhases.add(phase);
      });
    });
    
    // Adicionar colunas para cada fase
    const phasesArray = Array.from(allPhases).sort();
    phasesArray.forEach(phase => {
      csvContent += `,Tempo em ${phase}`;
    });
    
    // Quebra de linha após os cabeçalhos
    csvContent += "\n";
    
    // Adicionar cada ticket com informações
    for (const ticketId in this.ticketTimers) {
      const seconds = this.ticketTimers[ticketId];
      const ticketInfo = this.ticketData[ticketId] || this.getTicketInfo(ticketId);
      
      // Calcular tempo total (incluindo o atual se estiver ativo)
      let totalSeconds = seconds;
      if (ticketId === this.activeTicket && this.timerStartTime) {
        const elapsedSeconds = Math.floor((new Date() - this.timerStartTime) / 1000);
        totalSeconds += elapsedSeconds;
      }
      
      // Sanitizar campos para evitar problemas com CSV
      const sanitizedTitle = ticketInfo.title?.replace(/,/g, ' ') || '';
      const sanitizedOwner = ticketInfo.owner?.replace(/,/g, ' ') || '';
      const sanitizedCDA = ticketInfo.cda?.replace(/,/g, ' ') || '';
      const sanitizedStatus = ticketInfo.status?.replace(/,/g, ' ') || '';
      
      // Linha com dados básicos
      csvContent += `${ticketId},"${sanitizedTitle}","${sanitizedOwner}","${sanitizedCDA}","${sanitizedStatus}",${this.formatTimeWithSeconds(totalSeconds)}`;
      
      // Adicionar tempos por fase
      phasesArray.forEach(phase => {
        const phaseTime = this.ticketPhases[ticketId]?.[phase] || 0;
        csvContent += `,${this.formatTimeWithSeconds(phaseTime)}`;
      });
      
      // Quebra de linha
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
  
  // Método para exportar relatório JSON detalhado
  exportJsonReport() {
    const reports = {};
    
    // Preparar relatório para cada ticket
    Object.keys(this.ticketData).forEach(ticketId => {
      reports[ticketId] = this.getTicketReport(ticketId);
    });
    
    // Formatar como JSON
    const jsonContent = JSON.stringify(reports, null, 2);
    
    // Fazer download do JSON
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    
    // Se estamos em uma extensão, usamos a API de mensagens para solicitar o download
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'saveJsonReport',
        jsonContent: jsonContent
      }, (response) => {
        if (response && response.success) {
          this.showToast('Relatório JSON exportado com sucesso!', 'success');
        } else {
          this.showToast('Erro ao exportar relatório JSON', 'error');
        }
      });
    } else {
      // Fallback para download direto
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `timeMyTicket-relatorio-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Relatório JSON exportado com sucesso!', 'success');
    }
  }
  
  // Método para limpar todos os dados de um ticket
  resetTicketData(ticketId) {
    // Remove todos os dados do ticket
    delete this.ticketTimers[ticketId];
    delete this.ticketPhases[ticketId];
    delete this.ticketData[ticketId];
    delete this.phaseHistory[ticketId];
    
    // Se o ticket estava ativo, desativa-o
    if (this.activeTicket === ticketId) {
      this.activeTicket = null;
      this.timerStartTime = null;
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    // Salva as alterações
    this.saveToStorage({
      ticketTimers: this.ticketTimers,
      ticketPhases: this.ticketPhases,
      ticketData: this.ticketData,
      phaseHistory: this.phaseHistory,
      activeTicket: this.activeTicket,
      timerStartTime: null
    });
    
    // Atualiza a UI
    const cards = document.querySelectorAll(this.ticketCardSelector);
    cards.forEach(card => {
      if (card.getAttribute(this.ticketIdAttribute) === ticketId) {
        const timerIcon = card.querySelector('.ticket-timer-icon');
        if (timerIcon) {
          timerIcon.classList.remove('expanded', 'active');
          timerIcon.classList.add('minimized');
          
          const timerDisplay = timerIcon.querySelector('.timer-display');
          if (timerDisplay) {
            timerDisplay.textContent = '00:00:00';
          }
        }
      }
    });
    
    this.showToast(`Dados do ticket ${ticketId} resetados`, 'warning');
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
    // Verificar se o timer está inicializado
    if (!window.ticketTimer) {
      console.error('Timer não inicializado ao receber mensagem:', request.action);
      sendResponse({ success: false, error: 'Timer não inicializado' });
      return false;
    }
    
    // Exportar relatório CSV
    if (request.action === 'exportTimerReport') {
      window.ticketTimer.exportTimerReport();
      sendResponse({ success: true });
    }
    
    // Exportar relatório JSON
    if (request.action === 'exportJsonReport') {
      window.ticketTimer.exportJsonReport();
      sendResponse({ success: true });
    }
    
    // Obter informações de um ticket específico
    if (request.action === 'getTicketInfo') {
      const ticketInfo = window.ticketTimer.getTicketInfo(request.ticketId);
      sendResponse({ success: true, ticketInfo: ticketInfo });
    }
    
    // Obter relatório de um ticket específico
    if (request.action === 'getTicketReport') {
      const report = window.ticketTimer.getTicketReport(request.ticketId);
      sendResponse({ success: true, report: report });
    }
    
    // Pausar timer
    if (request.action === 'pauseTimer') {
      window.ticketTimer.pauseTimer();
      sendResponse({ success: true });
    }
    
    // Iniciar timer
    if (request.action === 'startTimer') {
      window.ticketTimer.startTimer(request.ticketId);
      sendResponse({ success: true });
    }
    
    // Limpar dados de um ticket
    if (request.action === 'resetTicketData') {
      window.ticketTimer.resetTicketData(request.ticketId);
      sendResponse({ success: true });
    }
    
    // Refresh timers
    if (request.action === 'refreshTimers') {
      window.ticketTimer.processExistingCards();
      sendResponse({ success: true });
    }
    
    // Forçar salvamento dos dados atuais
    if (request.action === 'forceSaveData') {
      window.ticketTimer.saveToStorage({
        ticketTimers: window.ticketTimer.ticketTimers,
        ticketPhases: window.ticketTimer.ticketPhases,
        ticketData: window.ticketTimer.ticketData,
        phaseHistory: window.ticketTimer.phaseHistory,
        activeTicket: window.ticketTimer.activeTicket,
        timerStartTime: window.ticketTimer.timerStartTime?.toISOString()
      });
      sendResponse({ success: true });
    }
    
    return true;
  });
}