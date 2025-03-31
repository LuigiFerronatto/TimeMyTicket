// Arquivo content.js - Melhorado para melhor compatibilidade com o DOM do HubSpot

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
      this.attemptCount = 0; // Contador para tentativas de processamento
      
      // Inicializar observador de DOM assim que a classe for instanciada
      this.init();
    }
    
    async init() {
      console.log('Iniciando TimeMyTicket...');
      
      // Carrega dados do localStorage
      await this.loadDataFromStorage();
      
      // Adiciona estilos globais para notificações de toast
      this.addToastStyles();
      
      // Inicializa observador de DOM para detectar novos cards
      this.initMutationObserver();
      
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
      
      // Cria o elemento do ícone do timer com tooltip dinâmico
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
      this.ticketTimers[this.activeTicket] = (this.ticketTimers[this.activeTicket] || 0) + elapsedTime;
      
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
      
      // Refresh timers
      if (request.action === 'refreshTimers' && window.ticketTimer) {
        window.ticketTimer.processExistingCards();
        sendResponse({ success: true });
      }
      
      return true;
    });
  }