const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');
const darkModeBtn = document.getElementById('dark-mode-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const exportHistoryBtn = document.getElementById('export-history-btn');

const API_KEY = '90037b458f941500ae305607ac1a392c';

let isWaitingForResponse = false;
let chatHistory = [];

document.addEventListener('DOMContentLoaded', () => {
    initializeDarkMode();
    loadChatHistory(); 
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isWaitingForResponse) {
            sendMessage();
        }
    });
    
    darkModeBtn.addEventListener('click', toggleDarkMode);
    clearHistoryBtn.addEventListener('click', clearChatHistory);
    exportHistoryBtn.addEventListener('click', exportChatHistory);  
    userInput.focus();
});

function initializeDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark');
        updateDarkModeIcon();
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDarkMode = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDarkMode);
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const isDarkMode = document.body.classList.contains('dark');
    darkModeBtn.innerHTML = `<span class="btn-icon">${isDarkMode ? '☀️' : '🌙'}</span>`;
}

async function sendMessage() {
    const userText = userInput.value.trim();
    
    if (userText === '' || isWaitingForResponse) {
        return;
    }

    isWaitingForResponse = true;
    sendBtn.disabled = true;
    
    addMessage(userText, 'user-message');
    userInput.value = '';
    
    showTypingIndicator();

    // Pobranie odpowiedzi z unifikowanej funkcji hybrydowej
    const response = await getBotResponse(userText);
    
    removeTypingIndicator();
    addMessage(response, 'bot-message');
    
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    scrollToBottom();
    userInput.focus();
    
    saveChatHistory(userText, response);
}

function addMessage(message, sender) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    messageContent.innerHTML = message.replace(/\n/g, '<br>');
    div.appendChild(messageContent);
    chatBox.appendChild(div);
    scrollToBottom();
}

// --- POPRAWIONA I ZBUDOWANA AUTOMATYZACJA SCROLLOWANIA NA MOBILE ---
function scrollToBottom() {
    setTimeout(() => {
        // 1. Wewnętrzny scroll samego kontenera czatu (desktop/tablety)
        if (chatBox) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        
        // 2. NOWOŚĆ: Automatyczny scroll całego ekranu smartfona w dół
        if (window.innerWidth <= 768) {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth' // Płynny, animowany zjazd w dół
            });
        }
    }, 100);
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.classList.add('message', 'bot-message');
    div.id = 'typing-indicator';
    
    const typingContent = document.createElement('div');
    typingContent.classList.add('message-content', 'typing-indicator');
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        typingContent.appendChild(dot);
    }
    
    div.appendChild(typingContent);
    chatBox.appendChild(div);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Główny mózg bota: decyduje, czy obsłużyć tekst ręcznie, czy odpytać API OpenWeatherMap
async function getBotResponse(userInput) {
    const lowerInput = userInput.toLowerCase();

    // 1. Obsługa zwrotów grzecznościowych
    const defaultReply = handleDefaultResponse(lowerInput);
    if (defaultReply) {
        return defaultReply;
    }

    // 2. Sprawdzenie, czy użytkownik podał parametry pogodowe słownie
    const hasNumbers = /\d+/.test(userInput);
    const hasWeatherKeywords = lowerInput.includes('stopn') || lowerInput.includes('stopie') || 
                               lowerInput.includes('ciepło') || lowerInput.includes('zimno') || 
                               lowerInput.includes('chłodno') || lowerInput.includes('pada') || 
                               lowerInput.includes('deszcz') || lowerInput.includes('śnieg') || 
                               lowerInput.includes('słońce') || lowerInput.includes('wiatr') ||
                               lowerInput.includes('gorąco') || lowerInput.includes('upał');

    if (hasNumbers || hasWeatherKeywords) {
        return processLocalWeatherDescription(lowerInput);
    }

    // 3. Traktujemy wpis jako miasto i uderzamy do API
    const cityName = userInput.replace(/(pogoda w|pogoda|w|sprawdź|miasto)/gi, '').trim();

    if (cityName.length < 2) {
        return '🤖 Nie wiem dokładnie jak pomóc. Możesz opisać pogodę (np. *"15 stopni i deszcz"*) lub podać nazwę miasta (np. *"Kraków"*).';
    }

    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${API_KEY}&units=metric&lang=pl`);
        
        if (!response.ok) {
            if (response.status === 401) {
                return '🔑 Klucz API oczekuje na aktywację globalną. Możesz w tym czasie testować bota wpisując warunki ręcznie, np.: *"12 stopni i deszcz"*!';
            }
            if (response.status === 404) {
                return `😔 Nie mogłem odnaleźć miasta "${cityName}". Upewnij się, że nie ma w nim literówki lub spróbuj podać parametry słownie.`;
            }
            throw new Error('Problem z API');
        }

        const data = await response.json();
        const temp = data.main.temp;
        const weatherDescription = data.weather[0].description;
        const weatherMain = data.weather[0].main.toLowerCase();
        const windSpeed = data.wind.speed * 3.6; // m/s -> km/h

        const mappedTemp = mapTemperature(temp);
        const mappedWeather = mapWeatherCondition(weatherMain);

        let finalResponse = `🌍 **Pogoda z API dla miasta: ${data.name}**\n`;
        finalResponse += `🌡️ Temperatura: ${temp.toFixed(1)}°C | ☁️ Stan: ${weatherDescription}\n`;
        finalResponse += `💨 Wiatr: ${windSpeed.toFixed(1)} km/h\n\n`;
        finalResponse += generateClothingRecommendation(mappedTemp, mappedWeather, windSpeed > 22);

        return finalResponse;

    } catch (error) {
        console.error(error);
        return '⚠️ Wystąpił problem z pobraniem danych pogodowych. Spróbuj opisać pogodę słownie!';
    }
}

// Analiza wyrażeń słownych
function processLocalWeatherDescription(lowerInput) {
    let detectedTempCategory = 'neutralnie';
    let detectedWeatherCategory = null;
    let isWindy = lowerInput.includes('wiatr') || lowerInput.includes('wieje') || lowerInput.includes('mocno');

    // Wyciąganie stopni z tekstu
    const tempMatch = lowerInput.match(/(-?\d+)\s*(deg|stop|°|\s|$)/);
    if (tempMatch && !isNaN(parseInt(tempMatch[1])) && lowerInput.includes('stop')) {
        const tempValue = parseInt(tempMatch[1]);
        detectedTempCategory = mapTemperature(tempValue);
    } else {
        if (lowerInput.includes('zimno') || lowerInput.includes('mróz') || lowerInput.includes('śnieg')) detectedTempCategory = 'zimno';
        else if (lowerInput.includes('chłodno') || lowerInput.includes('rześko')) detectedTempCategory = 'chłodno';
        else if (lowerInput.includes('ciepło') || lowerInput.includes('przyjemnie')) detectedTempCategory = 'ciepło';
        else if (lowerInput.includes('gorąco') || lowerInput.includes('upał') || lowerInput.includes('30°')) detectedTempCategory = 'gorąco';
    }

    // Wykrywanie dodatków pogodowych
    if (lowerInput.includes('deszcz') || lowerInput.includes('pada') || lowerInput.includes('mokro')) detectedWeatherCategory = 'deszcz';
    else if (lowerInput.includes('śnieg') || lowerInput.includes('sypie')) detectedWeatherCategory = 'śnieg';
    else if (lowerInput.includes('słońce') || lowerInput.includes('słonecz')) detectedWeatherCategory = 'słońce';
    else if (lowerInput.includes('burza')) detectedWeatherCategory = 'burza';
    else if (lowerInput.includes('mgła') || lowerInput.includes('pochmurno')) detectedWeatherCategory = 'mgła';

    let localHeader = `🤖 **Przeanalizowałem Twój opis pogodowy:**\n`;
    return localHeader + generateClothingRecommendation(detectedTempCategory, detectedWeatherCategory, isWindy);
}

function mapTemperature(temp) {
    if (temp <= 5) return 'zimno';
    if (temp > 5 && temp <= 12) return 'chłodno';
    if (temp > 12 && temp <= 19) return 'neutralnie';
    if (temp > 19 && temp <= 25) return 'ciepło';
    return 'gorąco';
}

function mapWeatherCondition(mainCondition) {
    if (mainCondition.includes('rain') || mainCondition.includes('drizzle')) return 'deszcz';
    if (mainCondition.includes('snow')) return 'śnieg';
    if (mainCondition.includes('clear')) return 'słońce';
    if (mainCondition.includes('thunderstorm')) return 'burza';
    if (mainCondition.includes('mist') || mainCondition.includes('fog') || mainCondition.includes('clouds')) return 'mgła';
    return null;
}

function generateClothingRecommendation(temperature, weather, isWindy) {
    let recommendation = '👕 **Oto moja rekomendacja odzieży:**\n\n';
    
    switch (temperature) {
        case 'zimno':
            recommendation += '❄️ **WARUNKI: Bardzo zimno**\n';
            recommendation += '• Kurtka zimowa lub puchowa parka\n';
            recommendation += '• Ciepłe spodnie (np. jeansy, grube legginsy)\n';
            recommendation += '• Gruby sweter lub polar\n';
            recommendation += '• Czapka, szalik i rękawiczki\n';
            recommendation += '• Zimowe buty z izolacją\n\n';
            break;
        case 'chłodno':
            recommendation += '🧥 **WARUNKI: Chłodno**\n';
            recommendation += '• Kurtka przejściowa (bomberka, softshell)\n';
            recommendation += '• Długie spodnie\n';
            recommendation += '• Lekki sweter lub bluza z kapturem\n';
            recommendation += '• Zamknięte buty sportowe / botki\n\n';
            break;
        case 'neutralnie':
            recommendation += '😊 **WARUNKI: Umiarkowana pogoda**\n';
            recommendation += '• Klasyczne spodnie lub wygodne jeansy\n';
            recommendation += '• T-shirt i rozpinana bluza na wierzch\n';
            recommendation += '• Buty sportowe lub casualowe\n\n';
            break;
        case 'ciepło':
            recommendation += '☀️ **WARUNKI: Ciepło**\n';
            recommendation += '• Krótkie spodenki, szorty lub spódnica\n';
            recommendation += '• Koszulka z krótkim rękawem / top\n';
            recommendation += '• Trampki lub sandały\n\n';
            break;
        case 'gorąco':
            recommendation += '🌡️ **WARUNKI: Upał**\n';
            recommendation += '• Luźne ubrania z przewiewnego materiału (len/bawełna)\n';
            recommendation += '• Koszulka na ramiączkach\n';
            recommendation += '• Sandały lub lekkie klapki\n\n';
            break;
    }
    
    if (isWindy && temperature !== 'gorąco') {
        recommendation += '💨 **⚠️ UWAGA:** Wieje silniejszy wiatr. Przydatna okaże się bluza z kapturem lub wiatrówka!\n\n';
    }
    
    if (weather) {
        switch (weather) {
            case 'deszcz':
                recommendation += '☔ **DODATKI NA DESZCZ:**\n• Parasol lub płaszcz przeciwdeszczowy\n• Nieprzemakalne obuwie\n';
                break;
            case 'śnieg':
                recommendation += '❄️ **DODATKI NA ŚNIEG:**\n• Buty z antypoślizgową podeszwą\n• Ciepłe rękawiczki\n';
                break;
            case 'słońce':
                recommendation += '🌞 **DODATKI NA SŁOŃCE:**\n• Okulary przeciwsłoneczne UV\n• Krem ochronny z filtrem SPF\n';
                break;
            case 'burza':
                recommendation += '⚡ **DODATKI NA BURZĘ:**\n• Kurtka z kapturem\n• Jeśli możesz, pozostań w bezpiecznym pomieszczeniu!\n';
                break;
            case 'mgła':
                recommendation += '🌫️ **DODATKI NA MGŁĘ:**\n• Elementy odblaskowe lub jasna odzież zapewniająca widoczność\n';
                break;
        }
    }
    
    recommendation += '\n💡 Mam nadzieję, że moja rada ułatwi Ci dzisiejszy wybór! 😊';
    return recommendation;
}

function handleDefaultResponse(input) {
    if (input.includes('cześć') || input.includes('hi') || input.includes('hello') || input.includes('hej') || input.includes('witaj')) {
        return '👋 Cześć! Jestem Twoim asystentem mody. Opisz mi pogodę (np. *\"15 stopni i deszcz\"*) lub podaj nazwę miasta, a dopasuję odpowiednie ubrania!';
    }
    if (input.includes('dzięki') || input.includes('dziękuję') || input.includes('thank')) {
        return '😊 Bardzo proszę! Jeśli potrzebujesz innej porady stylizacyjnej, pisz śmiało!';
    }
    if (input.includes('do widzenia') || input.includes('bye') || input.includes('pa')) {
        return '👋 Do zobaczenia! Ubieraj się stylowo i komfortowo! 🎉';
    }
    if (input.includes('co możesz') || input.includes('co potrafisz') || input.includes('pomoc')) {
        return '🤖 Analizuję tekst pod kątem pogody i temperatury bądź odpytuję globalne API w poszukiwaniu miast, aby dobrać optymalną garderobę. 👕';
    }
    return null;
}

function saveChatHistory(userMessage, botResponse) {
    chatHistory.push({ user: userMessage, bot: botResponse, timestamp: new Date().toLocaleString('pl-PL') });
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

function loadChatHistory() {
    const saved = localStorage.getItem('chatHistory');
    if (saved) {
        chatHistory = JSON.parse(saved);
    }
}

function clearChatHistory() {
    if (chatHistory.length === 0) { alert('Historia rozmów jest pusta!'); return; }
    if (confirm('Czy na pewno chcesz usunąć całą historię rozmów?')) {
        chatHistory = []; localStorage.removeItem('chatHistory'); chatBox.innerHTML = '';
        const welcomeMessage = document.createElement('div');
        welcomeMessage.classList.add('welcome-message');
        welcomeMessage.innerHTML = `<h3>Witaj ponownie! 👋</h3><p>Historia rozmów została wyczyszczona. Możemy zacząć od nowa!</p>`;
        chatBox.appendChild(welcomeMessage);
    }
}

function exportChatHistory() {
    if (chatHistory.length === 0) { alert('Brak historii do eksportu!'); return; }
    let csvContent = 'Czas,Pytanie,Odpowiedz\n';
    chatHistory.forEach(item => {
        csvContent += `${item.timestamp},"${item.user.replace(/"/g, '""')}","${item.bot.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
    });
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `chat-history.csv`);
    element.style.display = 'none'; document.body.appendChild(element); element.click(); document.body.removeChild(element);
}
