// Arquivo content.js - Melhorado para posicionamento e formato do timer

class TicketTimer {
  constructor() {
    // Estado do sistema
    this.ticketTimers = {}; // Objeto que armazena o tempo acumulado por ticket
    this.activeTicket = null; // ID do ticket atualmente sendo cronometrado
    this.timerStartTime = null; // Timestamp de quando o timer atual começou
    this.timerInterval = null; // Referência para o setInterval que atualiza o timer
    this.ticketTitles = {}; // Armazena os títulos dos tickets para melhor UX
    
    // Configurações específicas para o HubSpot baseadas no DOM analisado
    this.ticketCardSelector = '[data-test-id="cdb-column-item"]'; // Seletor para cards de tickets
    this.ticketIdAttribute = 'data-selenium-id'; // Atributo que contém o ID do ticket
    
    // Inicializa a extensão
    this.init();
  }
  
  async init() {
    console.log('Iniciando HubSpot Ticket Timer...');
    
    // Carrega dados do localStorage
    await this.loadDataFromStorage();
    
    // Inicializa observador de DOM para detectar novos cards
    this.initMutationObserver();
    
    // Processa os cards já existentes na página
    this.processExistingCards();
    
    // Se havia um timer ativo, retoma a contagem
    if (this.activeTicket && this.timerStartTime) {
      this.resumeActiveTimer();
    }
  }
  
  async loadDataFromStorage() {
    // Carrega dados do localStorage
    const data = await this.getFromStorage(['ticketTimers', 'activeTicket', 'timerStartTime', 'ticketTitles']);
    
    this.ticketTimers = data.ticketTimers || {};
    this.activeTicket = data.activeTicket || null;
    this.timerStartTime = data.timerStartTime ? new Date(data.timerStartTime) : null;
    this.ticketTitles = data.ticketTitles || {};
    
    console.log('Dados carregados:', { 
      ticketsMonitorados: Object.keys(this.ticketTimers).length,
      ticketAtivo: this.activeTicket 
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
          shouldProcessCards = true;
        }
      });
      
      if (shouldProcessCards) {
        setTimeout(() => this.processExistingCards(), 500); // Pequeno delay para garantir que o DOM esteja estável
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
    
    cards.forEach(card => {
      // Verifica se o card já foi processado
      if (!card.querySelector('.ticket-timer-icon')) {
        this.addTimerToCard(card);
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
    
    // Cria o elemento do ícone do timer
    const timerIcon = document.createElement('div');
    timerIcon.className = `ticket-timer-icon ${hasTime || isActive ? 'expanded' : 'minimized'} ${isActive ? 'active' : ''}`;
    timerIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span class="timer-display">${hasTime ? this.formatTimeWithSeconds(this.ticketTimers[ticketId]) : '00:00:00'}</span>
    `;
    
    // Adiciona evento de clique
    timerIcon.addEventListener('click', (e) => {
      e.stopPropagation(); // Impede que o card seja selecionado
      this.toggleTimer(ticketId);
    });
    
    // Melhoria no posicionamento do cronômetro
    // Vamos verificar as opções de posicionamento para maior compatibilidade
    const priorityTag = card.querySelector('[data-test-id="cdbc-priority"]');
    if (priorityTag) {
      // Inserir ao lado da tag de prioridade
      const tagContainer = priorityTag.parentElement;
      if (tagContainer) {
        tagContainer.insertBefore(timerIcon, priorityTag);
      }
    } else {
      // Fallback: insere após o título do ticket
      const titleContainer = card.querySelector('.Card__StyledTitleContainer-sc-1o9oolf-0');
      if (titleContainer) {
        titleContainer.appendChild(timerIcon);
      }
    }
    
    console.log(`Timer adicionado ao ticket ${ticketId}: "${ticketTitle}"`);
  }
  
  toggleTimer(ticketId) {
    console.log(`Toggle timer para o ticket: ${ticketId}`);
    
    // Se o ticket clicado já está ativo, pausa o timer
    if (this.activeTicket === ticketId) {
      this.pauseTimer();
    } else {
      // Se outro timer está ativo, pausa-o primeiro
      if (this.activeTicket) {
        this.pauseTimer();
      }
      
      // Inicia o timer para o novo ticket
      this.startTimer(ticketId);
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
    
    // Salva o estado atual
    this.saveToStorage({
      activeTicket: this.activeTicket,
      timerStartTime: this.timerStartTime.toISOString(),
      ticketTimers: this.ticketTimers
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
    const elapsedTime = Math.floor((new Date() - this.timerStartTime) / 1000);
    
    // Adiciona o tempo decorrido ao total do ticket
    this.ticketTimers[this.activeTicket] += elapsedTime;
    
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
      ticketTimers: this.ticketTimers
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
  
  formatTime(seconds) {
    // Formata o tempo em hh:mm
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  formatTimeWithSeconds(seconds) {
    // Formata o tempo em hh:mm:ss
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Métodos de manipulação de dados restantes (getTicketInfo, exportTimerReport) permanecem iguais...
  // Método para extrair informações dos tickets diretamente do DOM
  getTicketInfo(ticketId) {
    const cards = document.querySelectorAll(this.ticketCardSelector);
    
    // Valores padrão
    let ticketInfo = {
      id: ticketId,
      title: this.ticketTitles[ticketId] || `Ticket #${ticketId}`,
      owner: 'Desconhecido',
      status: 'Desconhecido',
      cda: 'Não informado'
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
        
        // Extrair proprietário do ticket
        const ownerElement = card.querySelector('[data-test-id="cdbc-property-0"] [data-test-id="cdbc-property-value"] span');
        if (ownerElement) {
          ticketInfo.owner = ownerElement.textContent.trim();
        }
        
        // Extrair CDA responsável
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
  
  // Método para exportar relatório detalhado
  exportTimerReport() {
    // Preparar cabeçalho do CSV
    let csvContent = "ID do Ticket,Título,Proprietário,CDA Responsável,Status,Tempo (hh:mm:ss),Tempo (segundos)\n";
    
    // Adicionar cada ticket com informações
    for (const ticketId in this.ticketTimers) {
      const seconds = this.ticketTimers[ticketId];
      const ticketInfo = this.getTicketInfo(ticketId);
      
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
      
      csvContent += `${ticketId},"${sanitizedTitle}","${sanitizedOwner}","${sanitizedCDA}","${sanitizedStatus}",${this.formatTimeWithSeconds(totalSeconds)},${totalSeconds}\n`;
    }
    
    // Fazer download do CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Se estamos em uma extensão, usamos a API de mensagens para solicitar o download
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'saveReportData',
        csvContent: csvContent
      });
    } else {
      // Fallback para download direto se não estiver em uma extensão
      const link = document.createElement('a');
      link.href = url;
      link.download = `hubspot-tickets-tempo-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
}

// Inicializa a extensão quando o DOM estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    console.log('Iniciando HubSpot Ticket Timer após DOMContentLoaded');
    window.ticketTimer = new TicketTimer();
  }, 1000); // Aguarda 1 segundo para garantir que o HubSpot carregou completamente
});

// Também inicia após um curto delay para garantir que funcione mesmo se
// o evento DOMContentLoaded já tiver ocorrido
setTimeout(() => {
  if (!window.ticketTimer) {
    console.log('Iniciando HubSpot Ticket Timer após timeout');
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
    
    // Obter informações de um ticket específico
    if (request.action === 'getTicketInfo' && window.ticketTimer) {
      const ticketInfo = window.ticketTimer.getTicketInfo(request.ticketId);
      sendResponse({ success: true, ticketInfo: ticketInfo });
    }
    
    return true;
  });
}