// (function a () {
let config = {
    'defaultBackground': 'images/gui/settings/history_bg.jpg',
    'host': 'localhost:3030',
    'defaultPosition': 0,
    'maxChatLength': 100,
    'specialMessageColor': '#ffe8a7',
    'serverMessageColor': 'red',
    'defaultNameColor': '#ffdd7d'
}

const fnames = ['Мику'];
const snames = ['Хацунэ'];

const maplocs = {
    "ext_aidpost": [1047,374,80,52,36],
    "ext_beach": [1205,691,299,118,19],
    "ext_boathouse": [834,802,119,46,1],
    "ext_camp_entrance": [291,450,113,91,10],
    "ext_clubs": [437,515,122,50,10],
    "ext_dining_hall_away": [1013,463,118,115,10],
    "ext_house_of_dv": [722,621,26,38,-36],
    "ext_house_of_mt": [966,177,26,38,11],
    "ext_house_of_sl": [1030,255,26,38,11],
    "ext_house_of_un": [817,151,26,38,11],
    "ext_house_of_sam": [889,163,26,38,11],
    "ext_lib": [1166,286,88,59,-23],
    "ext_musclub": [636,259,47,71,-17],
    "ext_old_camp": [238,1011,94,51,8],
    "ext_path": [554,51,133,169,-6],
    "ext_playground": [1410,489,151,118,10],
    "ext_square": [900,372,85,162,11],
    "ext_stage_big": [1088,57,61,135,-23],
    "ext_warehouse": [1292,84,42,58,45],
    "ext_admins": [780,355,88,85,10],
    get: function (name) {
        return this.hasOwnProperty(name) && this[name];
    }
};

let tempGlobalTimeCode;

// loaded server configuration
let serverConfig;
let serverNodesConfig;
let serverSpritepacksConfig;
let serverSpritepacks = [];
let serverSpritesConfig = {
    'bodies': []
};
let serverCharsConfig = {
    'chars': []
};

// processed server configuration
let serverCharacters = [];
let spriteFiles = [];

let socket = null;

let baseDoc;
let chat;
let map;
let menu;
let characterChooser;
let characterEditor;

let node;
let player;
let scales;

let webkit = (navigator.userAgent.includes("WebKit"));
let musicChannel = new Audio();
musicChannel.loop = true;

let ambienceChannel = new Audio();
ambienceChannel.loop = true;

let sfxChannel = new Audio();

let timer = new easytimer.Timer();

window.onload = function() {
    // document.body.setAttribute('screenmode', 'fixed16x9');
    scales = scaleWindow();
    initWindow();
    windowResize();
}

window.onresize = function () {
    if (baseDoc)
        windowResize();
    scales = scaleWindow();
}

window.oncontextmenu = function () {
    if (menu.menu)
        menu.hideMenu();
    else if (socket != null) //game started
        menu.showMenu();
    return false;
}

window.onmousemove = function(event){
    if (!baseDoc)
        return;
    if(document.body.getAttribute("screenmode") == "auto") {
        var scale = (baseDoc.background.clientWidth - document.body.clientWidth) * (event.clientX / document.body.clientWidth);
        baseDoc.background.style.transform = "translateX(-" + scale + "px)"
    }
}

function scaleWindow () {
    const resolutions = [[1920,1080],[1792,1008],[1664,936],[1536,864],[1408,792],[1280,720],[1152,648],[1024,576],[896,504],[768,432],[640,360],[512,288],[384,216]];
    let data = {};
    let cx = window.innerWidth;
    let cy = window.innerHeight;
    let resolution;

    for (let r in resolutions) {
        let res = resolutions[r];
        if (res[0] <= cx && res[1] <= cy) {
            resolution = res;
            break;
        }
    }
    if (!resolution) {
        err('screen too small');
        resolution = resolutions[resolutions.length - 1];
    }

    data.resolution = resolution;
    data.mapPointScale = resolution[0] / 1920;

    return data;
}

function initWindow () {
    baseDoc = new BaseDocument();

    let count = 0;
    let allc = 3;
    request(location.href + 'config', function (data) {
        serverConfig = data;
        if (++count == allc)
            initDoc();
    });
    request(location.href + 'nodes', function (data) {
        serverNodesConfig = data;
        if (++count == allc)
            initDoc();
    });
    request(location.href + 'spritepacks', function (data) {
        serverSpritepacksConfig = data;
        allc += data.packs.length;
        count++;
        for (let i = 0; i < data.packs.length; i++) {
            let pack = data.packs[i];
            request(location.href + 'spritepacks/' + pack.config, function (data) {
                serverSpritepacks[i] = data;
                if (++count == allc)
                    initDoc();
            });
        }
    });
}

function initDoc () {
    parseSpritepacks(serverSpritepacks);
    parseCharactersConfig(serverCharsConfig);
    parseSpriteConfig(serverSpritesConfig);

    // baseDoc = new BaseDocument();
    menu = new Menu();
    map = new Map();

    let p = lsGet('player');
    if (p != null) {
        // @TODO make a class methods for this
        player = new Player(p.name, p.color, p.character, new Sprite(p.sprite.body, p.sprite.emotion, p.sprite.cloth));
        player.clothIndex = p.clothIndex;
        player.mod = p.mod;
        characterEditor = new CharacterEditor();
    }
    else
        characterChooser = new CharacterChooser();
    
    // debug start
    // player = new Player(getRandomName(), "cdcdcd", serverCharacters[0].id, serverCharacters[0].sprite); start();
}

function start () {
    tempGlobalTimeCode = getTimeOfDay();

    let loc = lsGet('location', true);
    if (loc == null)
        loc = "int_bus";

    chat = new Chat();
    node = new Node(loc);

    initSocket(connectionOpened, parseServerMessage, connectionClosed);

    setTimer(true);

    return;
    setInterval(function () {
        let n = getTimeOfDay();
        if (n != tempGlobalTimeCode) {
            tempGlobalTimeCode = n;
            node.setHtmlOn(baseDoc);
        }
    }, serverConfig.dayStateChangePeriod / 2);
}

function setTimer (firsttime = false) {
    timer.start({
        precision: 'seconds',
        startValues: {
            'seconds': 0
        },
        target: {
            'seconds': (serverConfig.dayStateChangePeriod / 1000) + 2
        }
    });

    if (!firsttime)
        return;

    timer.addEventListener('targetAchieved', function (e) {
        tempGlobalTimeCode = getTimeOfDay();
        dbg(`changing time to ${tempGlobalTimeCode}`);
        node.setHtmlOn(baseDoc);
        
        timer.reset();
        setTimer();
    });
}

function initSocket (readyCallback, messageCallback, closeCallback) {
    if (socket != null) {
        return;
    }
    notify("Подключение к серверу");

    let http = location.href.startsWith("http://");
    socket = new WebSocket((http ? 'ws://' : 'wss://') + location.host + '/ws');
    socket.onopen = readyCallback;
    socket.onmessage = messageCallback;
    socket.onclose = closeCallback;
}

function connectionOpened () {
    notify("Соединение установленно");
    setInterval(function () {
        if (socket.readyState == socket.OPEN)
            socket.send("ping");
    }, 5000);
}

function parseServerMessage (msg) {
    let data = msg.data;
    let obj;

    let id = parseInt(data);
    if (id) {
        player.setId(id);
        sendPlayer();
        return;
    }
    else {
        try {
            obj = JSON.parse(data);
        } catch (e) {
            console.error(`error parsing server message. raw message: ${data}`);
            return;
        }
    }

    l(obj);
    // @TODO you know what to do
    if (obj.data)
        obj.reason = 'mapData';

    if (obj == undefined || obj.reason == undefined) {
        return;
    }

    switch (obj.reason) {
        case 'nodeData':
            if (node.code != obj.code) {
                node.destroy();
                player.hide();
                node = new Node(obj.code);
            }
            node.setActionCode(obj.actionCode);
            node.setUsers(obj.users);
            node.setHtmlOn(baseDoc);
            node.displayUsers();

            player.display();
            player.move();
            baseDoc.moveScreen();
            break;
        case 'userUpdate':
            let p = (player.id == obj.user.id) ? player : node.getUserById(obj.user.id);
            p.updateState(obj.user.state);
            if (p.position != obj.user.position) {
                p.setPosition(obj.user.position);
                p.move();
            }
            let sp = obj.user.sprite;
            p.updateSprite(new Sprite(sp.body, sp.emotion, sp.cloth));
            if (sp.accessory != 0)
                p.sprite.setAccessory(sp.accessory);
            p.display();
            p.move();
            break;
        case 'userJoin':
            if (obj.user.id == player.id)
                player.state = obj.user.state;
            else
                node.userJoin(obj.user);
                break;
        case 'chat':
            chat.printMessage(obj.sender, obj.message);
            break;
        case 'userLeave':
            node.userLeave(obj.id);
            break;
        case 'mapData':
            map.parseData(obj.data);
            break;
        case 'modAction':
            if (obj.type == 'modMute') {
                let msg;
                if (obj.target.length == 1)
                    msg = 'Игрок ' + node.getUserById(obj.target[0]).name + ' заглушен на ' + (obj.time / 1000) + ' секунд';
                else
                    msg = 'Многа';
                chat.printMessage(null, msg, true);
            }
            else if (obj.type == 'modUnmute') {
                let msg;
                if (obj.target.length == 1)
                    msg = 'Игрок ' + node.getUserById(obj.target[0]).name + ' амнистирован';
                else
                    msg = 'Многа';
                chat.printMessage(null, msg, true);
            }
    }
}

function connectionClosed (data) {
    err(`connection to WebSocket closed; code: + ${data.code}`);
    notify(`Соединение с сервером потеряно, код: ${data.code}`, true);
}

function charByName (name, spritepack) {
    for (let i = 0; i < serverCharacters.length; i++) {
        let char = serverCharacters[i];
        if (char.name == name/* && char.spritepack === spritepack*/)
            return char;
    }

    return null;
}

function parseSpritepacks (packsArray) {
    let charNames = [];
    for (let i = 0; i < serverSpritepacks.length; i++) {
        let pack = packsArray[i].bodies;
        let cname = "";
        for (let j = 0; j < pack.length; j++) {
            pack[j].spritepack = serverSpritepacksConfig.packs[i].name;
            serverSpritesConfig.bodies.push(pack[j]);
            if (pack[j].name != cname && charNames.indexOf(pack[j].name) < 0) {
                cname = pack[j].name;
                serverCharsConfig.chars.push({
                    'name': cname,
                    'spritepack': serverSpritepacksConfig.packs[i].name
                });
                charNames.push(cname);
            }
        }
    }
}

function parseCharactersConfig (config) {
    for (let i = 0; i < config.chars.length; i++) {
        let char = config.chars[i];
        let sc = {
            'id': i+1,
            'name': char.name,
            'spritepack': char.spritepack,
            'sprite': null
        };
        serverCharacters.push(sc);
    }
}

function parseSpriteConfig (config) {
    let id = serverCharacters[serverCharacters.length - 1].id;
    let currentCharName = "";
    for (let i = 0; i < config.bodies.length; i++) {
        let body = config.bodies[i];
        let res = parseBody(body, id);
        id = res.id;
        if (body.name != currentCharName) {
            let char = charByName(body.name, body.spritepack);
            res.id = undefined;
            char.sprite = res;
        }
    }
}

function parseBody (body, id) {
    let s = new Sprite(0, 0, 0);
    spriteFiles[++id] = body.file;
    body.id = id;
    s.setBody(id);

    if (body.emotions.length > 0) {
        s.setEmotion(id+1);
        body.emotionIds = []; //:harold:
        for (let em = 0; em < body.emotions.length; em++) {
            spriteFiles[++id] = body.emotions[em];
            body.emotionIds[em] = id;
        }
    }

    if (body.clothes.length > 0) {
        s.setCloth(id+1);
        body.clothIds = [];
        for (let cl = 0; cl < body.clothes.length; cl++) {
            if (body.clothes[cl] === '/empty')
                continue;
            spriteFiles[++id] = body.clothes[cl];
            body.clothIds[cl] = id;
        }
    }

    if (body.accessories && body.accessories.length > 0) {
        s.setAccessory(id+1);
        body.accessoryIds = [];
        for (let ac = 0; ac < body.accessories.length; ac++) {
            spriteFiles[++id] = body.accessories[ac];
            body.accessoryIds[ac] = id;
        }
    }

    s.id = id;
    return s;
}

class Player {
    id;
    name;
    color;
    character;
    sprite;
    position;
    state; // spectating/playing
    domSprite; //Sprite instance with DOM links //useless
    mod;
    clothIndex; //index of cloth in Body clothes array

    constructor(name, color, character, sprite) {
        this.name = name;
        this.color = color;
        this.character = character;
        this.sprite = sprite;
        this.position = config.defaultPosition;
        this.mod = false;
    }

    display () {
        if (this.state != 'playing')
            return;
        if (!this.domSprite || !this.domSprite.body) {
            this.domSprite = new Sprite(appendDiv(baseDoc.background), null, null);
            // fadeOut(this.domSprite.body);
        }
        this.domSprite.body.style.backgroundImage = this.sprite.buildUrl();
        this.domSprite.body.className = 'character';
    }

    move () {
        if (this.state != 'playing')
            return;
        if (!this.domSprite)
            this.display();
        this.domSprite.body.style.transform = `translateX(${this.position}%)`;
    }

    hide () {
        // removeElem(this.domSprite.body);
        if (this.domSprite && this.domSprite.body) {
            fadeIn(this.domSprite.body);
            this.domSprite = null;
        }
    }

    updateSprite (sprite) {
        this.sprite = sprite;
        updateLs();
    }

    setPosition (pos) {
        if (pos >= -50 && pos <= 50)
            this.position = pos;
    }

    updateState (state) {
        this.state = state;
    }

    setColor (color) {
        this.color = parseColor(color);
    }

    setId (id) {
        this.id = id;
    }
}

class Node {
    code;
    dayBg;
    sunsetBg;
    nightBg;

    ambience_day;
    ambience_night;
    music;

    actionCode;
    users;

    config;

    constructor(code) {
        this.code = code;
        if (!this.init())
            err(`node ${this.code} doesn't exist`);
    }

    init () {
        let code = this.code;
        for (var n in serverNodesConfig.nodes) {
	        let node = serverNodesConfig.nodes[n];
            if (node.code === this.code) {
                this.dayBg = node.data.day;
                this.sunsetBg = node.data.sunset;
                this.nightBg = node.data.night;
                this.ambience_day = node.data.ambience_day;
                this.ambience_night = node.data.ambience_night;
                this.music = node.data.music;
                this.config = node;
                return true;
            }
        }
        return false;
    }

    setHtmlOn (baseDocumentInstance) {
        let bg;

        if (baseDocumentInstance.fade)
            fadeIn(baseDocumentInstance.fade);
        
        switch (tempGlobalTimeCode/*this.actionCode*/) {
            case 'DAY':
                bg = this.dayBg;
                play(ambienceChannel, this.ambience_day);
                break;
            case 'SUNSET':
                bg = this.sunsetBg;
                if (bg) {
                    play(ambienceChannel, this.ambience_day);
                    break;
                }
            case 'NIGHT':
                bg = this.nightBg;
                if (bg) {
                    play(ambienceChannel, this.ambience_night);
                    break;
                }
                if (this.sunsetBg) {
                    play(ambienceChannel, this.ambience_day);
                    bg = this.sunsetBg;
                }
                else
                    bg = this.day;
        }
        baseDocumentInstance.background.style.backgroundImage = cssUrl(bg);
    }

    displayUsers () {
        for (let user in this.users) {
            if (this.users[user].id != player.id) {
                this.users[user].display();
                this.users[user].move();
            }
        }
    }
    
    destroy (baseDocumentInstance) {
        // removeElem(baseDocumentInstance.background);
        for (let user in this.users) {
            if (this.users[user].id != player.id)
                this.users[user].hide();
        }
        // fadeIn(baseDoc.background);
    }

    setActionCode (code) {
        this.actionCode = code;
    }

    setUsers (users) {
        // this.users = users;
        let players = [];
        for (var i = 0; i < users.length; i++)
            players.push(this.fromServerUser(users[i]));
        this.users = players;
    }

    userJoin (user) {
        let u = this.fromServerUser(user);
        this.users.push(u);
        u.display();
        u.move();
    }

    userLeave (id) {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].id == id) {
                this.users[i].hide();
                this.users.splice(i, 1);
                break;
            }
        }
    }

    getUserById (id) {
        for (let user in this.users)
            if (this.users[user].id == id)
                return this.users[user];
        return null;
    }

    fromServerUser (user) {
        let u = new Player(user.name, user.color, null, new Sprite(user.sprite.body, user.sprite.emotion, user.sprite.cloth));
        u.setId(user.id);
        u.setPosition(user.position);
        u.updateState(user.state);

        return u;
    } 
}

class Sprite {
    body;
    emotion;
    cloth;
    accessory;

    constructor(body, emotion, cloth) {
        this.body = body;
        this.emotion = emotion;
        this.cloth = cloth;
    }

    getSpriteFiles () {
        let fbody = "", femotion = "", fcloth = "", faccessory = "";

        if (this.body)
            fbody = spriteFiles[this.body];
        if (this.emotion)
            femotion = spriteFiles[this.emotion];
        if (this.cloth)
            fcloth = spriteFiles[this.cloth];
        if (this.accessory)
            faccessory = spriteFiles[this.accessory];

        let s = new Sprite(fbody, femotion, fcloth);
        if (faccessory)
            s.setAccessory(faccessory);

        return s;
    }

    buildUrl (noAccessories = false) {
        let cfiles = this.getSpriteFiles();
        return cssUrl(noAccessories ? undefined : cfiles.accessory, cfiles.emotion, cfiles.cloth, cfiles.body);
    }

    setBody (body) {
        this.body = body;
    }

    setEmotion (emotion) {
        this.emotion = emotion;
    }

    setCloth (cloth) {
        this.cloth = cloth;
    }

    setAccessory (accessory) {
        this.accessory = accessory;
    }

}

class Chat {
    elem;
    messages;
    input;
    inputbox;
    chatSrv;

    constructor () {
        this.init();
        this.chatSrv = new Player('Server', config.serverMessageColor, null, null);
    }

    init () {
        this.elem = appendDiv(baseDoc.screens);
        this.elem.className = 'chat';

        this.messages = appendDiv(this.elem);
        this.messages.className = 'messages';

        this.inputbox = appendDiv(this.elem);
        this.inputbox.className = 'input';
        // this.inputbox.innerHTML = '<div class="title">Чат:</div>';
        
        this.input = appendElement(this.inputbox, 'input');
        this.input.placeholder = 'Введите сообщение';
        this.input.autocomplete = 'off';
        this.input.setAttribute('maxlength', config.maxChatLength);

        this.input.onkeydown = function (event) {
            let val = chat.input.value;
            if (val.length == 0) {
                return;
            } else if (val.length > config.maxChatLength) {
                notify("Сообщение слишко длинное. Максимум " + config.maxChatLength + " символов.")
                err(`too long message`);
                return;
            }
            if (event.key == 'Enter') {
                if (val.length > 0) {
                    if (val.startsWith('/') && !val.startsWith('/me'))
                        parseCommand(val);
                    else
                        sendChatMessage(val);
                    chat.input.value = '';
                }
            }
        };
    }

    printMessage (senderId, message, srv = false) {
        let sender = !srv ? (player.id == senderId) ? player : node.getUserById(senderId) : this.chatSrv;

        if (sender == null) {
            console.error(`unknown sender ${senderId}`);
            return;
        }

        let name = player.mod ? sender.name + ':' + sender.id : sender.name;
        let raw = '<font color=' + sender.color + '>' + name + '</font>';
        if (srv)
            raw = '<font style=\'font-style: italic;\' color=' + sender.color + '>' + message + '</font>';
        else if (message.startsWith('/me'))
            raw += ` <font color = ${config.specialMessageColor}>` + message.slice(4) + '</font>';
        else if (message.startsWith('*') && message.endsWith('*'))
            raw += ` <font color = ${config.specialMessageColor}>` + message.slice(1, message.length - 1) + '</font>';
        else
            raw += ': ' + message;
        
        let msgElem = appendElement(this.messages, 'span');
        
        msgElem.className = 'msg';
        msgElem.innerHTML = raw;
        msgElem.id = msgElem.childNodes[0].id = senderId;
        msgElem.childNodes[0].onmouseenter = function () {
            let glowUser = node.getUserById(this.id);
            if (glowUser != null && glowUser.domSprite != null)
                glowUser.domSprite.className = 'character glow';
        };
        msgElem.childNodes[0].onmouseleave = function () {
            let unGlowUser = node.getUserById(this.id);
            if (unGlowUser != null && unGlowUser.domSprite != null) {
                unGlowUser.domSprite.className = 'character';
            }
        };
    }
}

class CharacterChooser {
    elem;
    selector;
    cspritepack;

    constructor () {
        this.cspritepack = 0;
        this.elem = appendDiv(baseDoc.screens);
        this.elem.className = 'character-editor startscreen';

        // let title = appendDiv(this.elem);
        // title.className = 'settings_title';
        // title.innerHTML = 'НАСТРОЙКА ПЕРСОНАЖА';
        // title.innerHTML = '<img src="images/gui/settings/star.png">НАСТРОЙКА ПЕРСОНАЖА<img src="images/gui/settings/star.png">';

        /*let bleft, bright;
        bleft = appendDiv(this.elem, 'button');
        bright = appendDiv(this.elem, 'button');

        bleft.className = bright.className = 'spritepackSwitchButton';
        bleft.style.left = bright.style.right = '10px';
        bleft.style.backgroundImage = cssUrl('images/gui/backward.png');
        bright.style.backgroundImage = cssUrl('images/gui/forward.png');

        
        bleft.onclick = function () {
            let cspr = characterChooser.cspritepack;
            cspr = cspr == 0 ? serverSpritepacksConfig.packs.length - 1 : cspr - 1;
            l('moved to left:' + cspr);
            characterChooser.cspritepack = cspr;
            characterChooser.spritepackSelector(serverSpritepacksConfig.packs[cspr].name);
        };

        bright.onclick = function () {
            let cspr = characterChooser.cspritepack;
            cspr = cspr == serverSpritepacksConfig.packs.length - 1 ? 0 : cspr + 1;
            l('moved to right:' + cspr);
            characterChooser.cspritepack = cspr;
            characterChooser.spritepackSelector(serverSpritepacksConfig.packs[cspr].name);
        };*/

        this.spritepackSelector(serverSpritepacksConfig.packs[0].name);
    }

    spritepackSelector (pack) {
        if (this.selector) {
            removeElem(this.selector);
            this.selector = null;
        }

        let selector = appendDiv(this.elem);
        this.selector = selector;
        selector.className = 'pose-selector char-grid';

        for (let i = 0; i < serverCharacters.length; i++) {
            if (serverCharacters[i].spritepack != pack)
                continue;
            if (!serverCharacters[i].sprite)
                continue;
            let e = appendDiv(selector);
            let csp = serverCharacters[i].sprite;
            e.className = 'pose';
            e.style.backgroundImage = csp.buildUrl(true);
            e.onclick = function () {
                player = new Player(
                    // getRandomName(),
                    // getRandomColor(),
                    null,
                    null,
                    charByName(serverCharacters[i].name, serverCharacters[i].spritepack).id,
                    new Sprite(csp.body, csp.emotion, csp.cloth));
                // @TODO ACCESSORIES
                /*if (csp.accessory)
                    player.sprite.setAccessory(csp.accessory);*/
                player.clothIndex = 0;
                removeElem(characterChooser.elem);
                characterEditor = new CharacterEditor();
            }
        }
    }
}

class CharacterEditor {
    elem;

    constructor () {
        this.elem = appendDiv(baseDoc.screens);
        this.elem.className = 'character-editor';
        let base = this.elem;

        let charbg = appendDiv(this.elem);
        charbg.className = 'charbg';
        charbg.style.backgroundImage = player.sprite.buildUrl();

        // let title = appendDiv(this.elem);
        // title.className = 'settings_title';
        // title.innerHTML = 'НАСТРОЙКА ПЕРСОНАЖА';

        let backButton = appendDiv(this.elem);
        backButton.className = 'settings_link link_lb';
        backButton.innerText = '← Назад';
        backButton.onclick = function () {
            removeElem(characterEditor.elem);
            characterChooser = new CharacterChooser();
        }

        let selector = appendDiv(this.elem);
        selector.className = 'pose-selector pose-selector-mini';

        let inputName = appendElement(selector, 'input');
        let charName = serverCharsConfig.chars[player.character - 1].name;
        charName = charName.replace('/n', '');
        inputName.placeholder = getRandomName();
        inputName.className = 'inputfield';
        inputName.autocomplete = 'off';
        inputName.setAttribute('maxlength', 26);

        if (player.name == null)
            inputName.value = player.name = charName;
        else
            inputName.value = player.name;

        inputName.onchange = function () {
            player.name = inputName.value;
        }

        let colorInput = appendElement(selector, 'input');
        colorInput.type = 'color';
        colorInput.className = 'inputfield';
        if (player.color == null) {
            inputName.style.color = player.color = parseColor(config.defaultNameColor);
            colorInput.value = config.defaultNameColor;
        }
        else {
            inputName.style.color = player.color;
            colorInput.value = '#'+player.color;
        }
        colorInput.onchange = function () {
            inputName.style.color = colorInput.value;
            player.setColor(colorInput.value);
        }

        let playButton = appendDiv(this.elem);
        playButton.className = 'settings_link link_rb';
        playButton.innerText = 'Играть!';
        playButton.onclick = function () {
            if (player.name.length == 0)
                player.name = getRandomName();
            removeElem(base);
            lsSet('player', player);
            start();
        }
    }
}

class Map {
    elem;
    img;

    constructor () {}

    show () {
        this.hide();
        this.elem = appendDiv(baseDoc.screens);
        this.elem.className = "map";
        this.elem.style.width = `${scales.resolution[0]}px`;
        this.elem.style.height = `${scales.resolution[1]}px`;
        this.elem.onclick = function() {
            map.hide();
        };
        windowResize();
        socket.send('{"reason": "getRoomsData"}');
    }

    hide () {
        // contextmenu.enabled = true;
        if(this.elem != null) {
            removeElem(this.elem);
            this.elem = null;
        }
    }

    parseData (data) {
        let append = this.elem;
        let scale = scales.mapPointScale;
        for (let name in data) {
            let loc = maplocs.get(name);
            if (!loc)
                continue;
            let zone = appendDiv(append);
            let count = data[name];
            zone.className = "mappoint";
            zone.style.left = loc[0] * scale;
            zone.style.top = loc[1] * scale;
            zone.style.width = loc[2] * scale;
            zone.style.height = loc[3] * scale;
            zone.style.transform = "rotate(" + loc[4] + "deg)";
            zone.onclick = function () {
                dbg(`loading ${name} node`);
                sendChangeNode(name);
                lsSet('location', name, true);
            };

            let point = appendDiv(zone);
            point.className = "point";
            point.setAttribute("online", count);
            if(count > 0)
                point.style.transform = "rotate(" + (225 - loc[4]) + "deg) scale(1.2)";
            else {
                point.style.transform = "rotate(" + (225 - loc[4]) + "deg) scale(1)";
                point.style.opacity = 0.7;
            }
        }
    }
}

let menuData = {
    'changeSprite': {
        'icon': 'images/gui/icon/pose.png',
        'title': 'Позы/эмоции',
        'action': function () {
            // menu.hideMenu();
            baseDoc.spriteSelector();
        }
    },
    'changePosition': {
        'icon': 'images/gui/icon/move.png',
        'title': 'Сместиться',
        'action': function () {
            baseDoc.moveScreen();
        }
    },
    'dress': {
        'icon': 'images/gui/icon/clothes.png',
        'title': 'Стать модным',
        'action': function() {
            baseDoc.clothSelector();
        }
    },
    'showActions': {
        'icon': 'images/gui/icon/action.png',
        'title': 'Действия',
        'action': function () {
            menu.showActionsMenu(node.config.data.move);
        }
    },
    'openMap': {
        'icon': 'images/gui/icon/map.png',
        'title': 'Карта',
        'action': function () {
            map.show();
        }
    },
    'openSettings': {
        'icon': 'images/gui/icon/tools.png',
        'title': 'Настройки',
        'hidden': true,
        'action': function () {}
    }
};

class Menu {
    menu;
    settings;

    constructor () {}

    menuElem () {
        baseDoc.hideSelector();
        if (this.menu)
            this.hideMenu();
        this.menu = appendDiv(baseDoc.screens);
        this.menu.className = 'context-menu';
    }

    showMenu () {
        this.menuElem();
        for (let i in menuData) {
            let obj = menuData[i];
            if (obj.hidden)
                continue;
            let button = appendDiv(this.menu);

            button.className = 'button';
            button.innerText = obj.title;
            button.style.backgroundImage = cssUrl(obj.icon);
            button.onclick = function () {
                menu.hideMenu();
                obj.action();
            }
        }

    }

    showActionsMenu (moves) {
        this.menuElem();
        for (let i = 0; i < moves.length; i++) {
            let move = moves[i];
            let button = appendDiv(this.menu);

            button.className = 'button';
            button.innerText = move.name;
            button.style.backgroundImage = cssUrl("images/gui/icon/action.png");
            button.onclick = function () {
                // menu.hideMenu();
                // obj.action();
                menu.hideMenu();
                sendChangeNode(move.target);
            }
        }
    }

    showSettings () {
        this.hideMenu();
        /* ... */
    }

    hideMenu () {
        if (this.menu) {
            removeElem(this.menu);
            this.menu = null;
        }
    }

    hideSettings () {
        if (this.settings)
            removeElem(this.settings);
    }

}

class BaseDocument {
    background = null;
    screens = null;
    movescreen = null;

    constructor() {
        this.background = appendDiv(document.body);
        this.background.className = 'background';
        this.background.style.backgroundImage = cssUrl(config.defaultBackground);

        this.screens = appendDiv(document.body);
        this.screens.className = 'screens';
    }

    selector () {
        this.hideSelector();

        let selector = appendDiv(this.screens);
        // +pose-selector-mini
        selector.className = 'pose-selector char-grid';

        return selector;
    }

    hideSelector () {
        let old = document.querySelector(".pose-selector");
        if (old)
            removeElem(old);
    }

    spriteSelector () {
        let selector = this.selector();
        let cname = serverCharsConfig.chars[player.character - 1].name;
        for (let i = 0; i < serverSpritesConfig.bodies.length; i++) {
            let body = serverSpritesConfig.bodies[i];

            if (body.name != cname) {
                /*if (selector.childNodes.length > 0)
                    break;
                else*/
                    continue;
            }

            if (body.clothes[player.clothIndex] === '/empty')
                continue;

            let pose = appendDiv(selector);
            pose.className = 'pose';
            pose.style.backgroundImage = cssUrl(body.emotions[0], body.clothes[player.clothIndex], body.file);

            /*if (body.name == 'Пионер') {
                l(body);
            }*/

            // @TODO maybe remove
            pose.onclick = function () {
                if ((!body.emotions || body.emotions.length == 0) && (!body.clothes || body.clothes.length == 0)) {
                    player.sprite.setBody(spriteFiles.indexOf(body.file));
                    sendSpriteUpdate(player.sprite);
                    removeElem(selector);
                }
            }

            for (let j = 0; j < body.emotions.length; j++) {
                let emotion = appendDiv(pose);
                emotion.className = 'face';
                // @TODO ACCCESORIES
                emotion.style.backgroundImage = cssUrl(body.accessories ? /*body.accessories[0]*/undefined : undefined, body.emotions[j], body.clothes[player.clothIndex], body.file);
                emotion.style.backgroundPosition = body.hasOwnProperty("offset") ? body.offset : "50% 30%";
                emotion.style.height = 360 / body.emotions.length;
                emotion.style.width = 90;

                emotion.onclick = function () {
                    player.sprite.setBody(body.id);

                    if (body.emotions && body.emotions.length > 0)
                        player.sprite.setEmotion(body.emotionIds[j]);
                    else
                        player.sprite.setEmotion(0);

                    if (body.clothes && body.clothes.length > 0) {
                        if (player.sprite && player.sprite.cloth != 0) {
                            player.sprite.setCloth(body.clothIds[player.clothIndex]);
                            // player.clothIndex = 0;
                        }
                    }
                    else
                        player.sprite.setCloth(0);

                    // temporarily disables accessories sending
                    // if (body.accessories && body.accessories.length > 0)
                        // player.sprite.setAccessory(body.accessoryIds[0]);
                    // else
                        player.sprite.setAccessory(0);

                    sendSpriteUpdate(player.sprite);
                    baseDoc.hideSelector();
                    // removeElem(selector);
                }
                emotion.onmouseenter = function () {
                    pose.style.backgroundImage = this.style.backgroundImage;
                }
            }
        }
    }

    clothSelector () {
        let selector = this.selector();
        let cname = serverCharsConfig.chars[player.character - 1].name;

        let clothes = [];
        let bodies = [];
        let empty = true;
        for (let i = 0; i < serverSpritesConfig.bodies.length; i++) {
            let body = serverSpritesConfig.bodies[i];
            if (cname != body.name)
                continue;
            if (body.clothes.length == 0)
                continue;
            for (let j = 0; j < body.clothes.length; j++) {
                if (body.clothes[j] == '/empty')
                    continue;
                let pose = appendDiv(selector);
                pose.className = 'pose';
                pose.style.backgroundImage = cssUrl(body.emotions[0], body.clothes[j], body.file);
                pose.onclick = function () {
                    player.clothIndex = j;
                    player.sprite.body = body.id;
                    player.sprite.cloth = body.clothIds[j];
                    player.sprite.emotion = body.emotionIds[0];
                    // @TODO think about it
                    player.sprite.accessory = 0;
                    sendSpriteUpdate(player.sprite);
                    removeElem(selector);
                }
                empty = false;
            }
            break;
        }

        if (empty)
            removeElem(selector);
    }

    moveScreen () {
        if (this.movescreen != null && this.movescreen.parentElement != null) {
            removeElem(this.movescreen);
            let ghost = document.querySelector("#ghost");
            if (ghost)
                removeElem(ghost);
        }
        this.movescreen = appendDiv(this.screens);
        this.movescreen.className = 'move-screen';

        let char = appendDiv(this.background);
        let fc = player.sprite.getSpriteFiles();

        let pos;

        char.className = 'character';
        char.id = 'ghost';
        char.style.backgroundImage = cssUrl(fc.emotion, fc.cloth, fc.body);
        char.style.opacity = 0.5;
        char.style.transition = 'all 0s';
        translate(char, player.position);

        this.movescreen.onclick = function () {
            removeElem(char);
            removeElem(baseDoc.movescreen);
            baseDoc.movescreen = null;
            sendMovePosition(pos);
        }

        this.movescreen.onmousemove = function (event) {
            if (document.body.getAttribute('screenmode') == 'auto') {
                char.style.transform = 'translateX(' + (event.clientX / document.body.clientWidth * 100 - 50) + '%)';
                pos = event.clientX / document.body.clientWidth * 100 - 50;
            }
            else if(document.body.getAttribute("screenmode") == "fixed16x9") {
                if(webkit) {
                    var offset = (document.body.offsetWidth - 1280)/2;
                    baseDoc.movescreen.ghost.style.transform = "translateX("+((event.clientX/zoom-offset)/1280*100-50)+"%)";
                    pos = ((event.clientX/zoom-offset)/1280*100-50);
                } else {
                    layers.movescreen.ghost.style.transform = "translateX("+(event.layerX/1280*100-50)+"%)";
                    pos = (event.layerX/1280*100-50);
                }
        }
        };
    }
}

function sendPlayer () {
    if (player == null || socket == null)
        return;
    var data = {
        "reason": "userInit",
        "id": player.id,
        "name": player.name,
        "color": player.color,
        "character": player.character,
        "node": node.code,
        "sprite": player.sprite
    };
    socket.send(JSON.stringify(data));
}

function sendChangeNode (code) {
    baseDoc.fade = appendDiv(document.body);
    baseDoc.fade.className = 'fade';
    setTimeout(_sendChangeNode, 500, code);
}

function _sendChangeNode (code) {
    var data = {
        'reason': 'clientMove',
        'target': 'node',
        'node': code
    }
    socket.send(JSON.stringify(data));
}

function sendMovePosition (pos) {
    var data = {
        'reason': 'clientMove',
        'target': 'position',
        'position': Math.round(pos)
    };
    socket.send(JSON.stringify(data));
}

function sendSpriteUpdate (sprite) {
    var data = {
        'reason': 'updateSprite',
        'sprite': sprite
    };
    socket.send(JSON.stringify(data));
}

function sendChatMessage (msg) {
    var data = {
        'reason': 'chat',
        'message': msg
    };
    socket.send(JSON.stringify(data))
}

function sendMute (targetId, time) {
    var data = {
        'reason': 'modMute',
        'targetId': targetId,
        'muteTime': time
    };
    socket.send(JSON.stringify(data));
}

function request(url, callback) {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                err(`error parsing reponse from: ${url}. raw response: ${xhr.responseText}`);
                return;
            }
            dbg(`successfully loaded ${url}`);
            callback(data);
        }
    };
    xhr.onprogress = function () {};
    xhr.open('GET', url, true);
    xhr.send(null);
}

function appendDiv (parent) {
    return appendElement(parent, 'div');
}

function appendElement (parent, elemType) {
    var elem = document.createElement(elemType);
    if (parent != undefined)
        parent.appendChild(elem);
    return elem;
}

function removeElem (elem) {
    if (elem == null || elem.parentElement == null)
        dbg(elem);
    elem.parentElement.removeChild(elem);
}

function cssUrl () {
    let string = '';
    for (let i = 0; i < arguments.length; i++) {
        if (arguments[i])
            string += `url(${arguments[i]}), `;
    }
    /*if (string.match('OSD'))
        l(arguments);*/
    return string.slice(0, string.length - 2);
}

function translate (elem, pos) {
    elem.style.transform = `translateX(${pos}%)`;
}

function bgOn (elem, url) {
    elem.style.backgroundImage = cssUrl(url);
}

function className (elem, name) {
    elem.className = name;
}

function l (s) {
    console.log(s);
}

function err (s) {
    console.error(s)
}

function dbg (s) {
    console.log(s);
}

function getRandomColor () {
    var letters = '0123456789ABCDEF';
    var color = '';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function getRandomName () {
    return fnames[Math.floor((Math.random() * fnames.length) + 0)] + ' ' + snames[Math.floor((Math.random() * snames.length) + 0)];
}

function getTimeOfDay () {
    let n = Math.floor((Date.now() - serverConfig.startTime) / serverConfig.dayStateChangePeriod) % 3;
    let res = 'DAY';
    if (n == 0)
        res = 'DAY';
    else if (n == 1)
        res = 'SUNSET';
    else if (n == 2)
        res = 'NIGHT';
    else
        console.error('time error: ' + n);
    return res;
}

function parseColor (c) {
    return c.startsWith('#') ? c.slice(1, c.length) : c;
}

function parseCommand (msg) {
    if (msg.startsWith('/node')) {
        sendChangeNode(msg.split(' ')[1]);
    }
    else if (msg.startsWith('/move')) {
        sendMovePosition(msg.split(' ')[1]);
    }
    else if (msg.startsWith('/sp')) {
        let m = msg.split(' ');
        sendSpriteUpdate(new Sprite(m[1], m[2], m[3]));
    }
    else if (msg.startsWith('/mute')) {
        let m = msg.split(' ');
        let inputTime = m[2], time, multiplier = 1, tname;
        if (m.length < 3 || !inputTime)
            return;
        tname = m[2].charAt(m[2].length - 1);
        switch (tname) {
            case 'h':
                multiplier *= 60;
            case 'm':
                multiplier *= 60;
            case 's':
                multiplier *= 1000;
        }
        try {
            time = parseInt(m[2].substr(0, multiplier == 1 ? m[2].length : m[2].length - 1)) * multiplier;
        } catch (e) {
            return;
        }
        sendMute(m[1], time);
    }
    else if (msg.startsWith('/unmute')) {
        let m = msg.split(' ');
        if (m.length < 2)
            return;
        sendMute(m[1], 0);
    }
    else if (msg.startsWith('/mod')) {
        if (player.mod)
            player.mod = false;
        else
            player.mod = true;
    }
}

function windowResize() {
    return;
    if(document.body.getAttribute("screenmode") == "auto") {
        var sizeX = document.body.clientWidth/16;
        var sizeY = document.body.clientHeight/9;
        sizemodifer = sizeY-sizeX;
        var scale = (baseDoc.background.clientWidth-document.body.clientWidth)*0.5;
        baseDoc.background.style.transform = "translateX(-"+scale+"px)";
        if(sizemodifer > 0) {
            var scl = 720/document.body.clientHeight;
            baseDoc.background.style.height = "";
            baseDoc.background.style.marginTop = "";
            baseDoc.background.style.width = 1280/scl;
        } else {
            baseDoc.background.style.height = (-4*sizemodifer+document.body.clientHeight)+"px";
            baseDoc.background.style.marginTop = 1.5*sizemodifer;
            baseDoc.background.style.width = "";
        }
        if(baseDoc.screens != null) {
            var scaleX = document.body.clientWidth/1280;
            var scaleY = document.body.clientHeight/720;
            scale = scaleX;
            if(scaleX > scaleY) {
                scale = scaleY
            }
            if(webkit) {
                baseDoc.screens.style.zoom = scale;
            } else {
                baseDoc.screens.style["transform"] = "scale("+scale+")";// translate3d(-50%, -50%, 0)";
                baseDoc.screens.style.left = (document.body.clientWidth-1280)/2;
                baseDoc.screens.style.top = (document.body.clientHeight-720)/2;
            }
        }
    } else if(document.body.getAttribute("screenmode") == "fixed16x9") {
        var scaleX = document.body.clientWidth/1280;
        var scaleY = document.body.clientHeight/720;
        zoom = scaleX;
        if(scaleX > scaleY) {
            zoom = scaleY
        }
        if(webkit) {
            document.body.style.zoom = zoom;
        } else {
            document.body.style["transform"] = "scale("+zoom+") translateY("+(720/2)+"px)";
        }
    }
}

function notify(text, stay = false) {
    if(document.querySelector("#notify"))
        removeElem(document.querySelector("#notify"));
    dbg(`notify: ${text}`);
    var notify = appendDiv(baseDoc.screens);
    notify.id = "notify"
    notify.innerHTML = text;
    if (stay)
        return;
    setTimeout(function () {
        if (notify && notify.parentElement)
            removeElem(notify)
    }, 1500);
}

let currentPlaying;

function play (channel, src) {
    if (currentPlaying == src)
        return;
    dbg (`changing ${currentPlaying} to ${src}`);
    currentPlaying = src;
    channel.pause();
    channel.currentTime = 0.0;
    if(src && src != "") {
        try {
            channel.src = src;
            channel.play();
        } catch (ignoring) {}
    }
}

function fadeIn(elem){
    if(elem != null && elem.parentNode != null) {
        elem.className = elem.className+" fadein";
        setTimeout(removeElem, 500, elem);
    }
}
function fadeOut(elem, end = false){
    if(elem != null && elem.parentNode != null) {
        if(end) {
            elem.className = elem.className.replace(" fadeout","");
        } else {
            elem.className = elem.className+" fadeout";
            setTimeout(fadeOut, 500, elem, true);
        }
    }
}

function lsGet (key, nojson = false) {
    let item = localStorage.getItem(key);
    return item != null ? (nojson ? item : JSON.parse(item)) : null;
}

function lsSet (key, obj, nojson = false) {
    localStorage.setItem(key, nojson ? obj : JSON.stringify(obj));
}

function updateLs () {
    lsSet('player', player);
}