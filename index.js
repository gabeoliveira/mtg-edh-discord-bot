const Discord = require("discord.js");
const config = require("./config.json");
const fs = require('fs')
const axios = require('axios');
const dotenv = require('dotenv/config');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const syncService = process.env.SYNC_SERVICE_SID;
const twilioClient = require('twilio')(accountSid, authToken);


const client = new Discord.Client();


const prefix = "!";



client.on("message", async function(message) { 
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const channelId = message.channel.id;

    console.log(`Channel ID: ${channelId}`);
    
    const commandBody = message.content.slice(prefix.length);
    const args = commandBody.split(' ');
    const command = args.shift().toLowerCase();

    

    try{

        var syncData = await twilioClient.sync.services(syncService)
        .documents(channelId)
        .fetch()
        .catch(err => {
            if(err.status == 404) console.log('Game not found')
            else console.log(err)});

        if(syncData) {
            var data = syncData.data;

            if(!data.players) data.players = []; //initialize players as an empty array

        }
        
        if (command === "join") {

            let query = ''
            for(i in args){
                query = query + args[i] + '+' 
            }

            scryfallRequest(query,message,data,channelId);

            
        }
        
        else if (command === "reset") {
            data.players = [];
            data.gameStarted = false;
            data.counter = 0;

            updateSyncDocument(channelId,data);

        }

        else if (command === "plus") {
            let player = data.players.find(player => player.username == message.author.username);

            player.lifeTotal+= parseInt(args[0]);

            message.reply(`just **gained ${args[0]}** life. Their life total is now **${player.lifeTotal}**`);

            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if (command === "minus") {
            let player = data.players.find(player => player.username == message.author.username);

            player.lifeTotal-= parseInt(args[0]);

            message.reply(`just **lost ${args[0]}** life. Their life total is now **${player.lifeTotal}**`);

            if(player.lifeTotal <= 0){
                message.reply(`is out of the game`);

                player.isActive = false;


            }

            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if (command === "commdamage") {

            if(!args[1]) return;    //ignores the command if there's no damage

            let player = data.players.find(player => player.commanders.some(commander => commander.name.toLowerCase().includes(args[0].toLowerCase())) == true);

            let commanderFound = player.commanders.find(commander => commander.name.toLowerCase().includes(args[0].toLowerCase()));

            let playerDamaged = data.players.find(player => player.username == message.author.username);

            let commander = playerDamaged.commanderDamage.find(commander => commander.name == commanderFound.name);
            
            if(commander){
                console.log('Found Damage');

                commander.damage = parseInt(commander.damage) + parseInt(args[1]);

                if(commander.damage >= 21){
                    message.reply(`is out of the game`);

                    playerDamaged.isActive = false;


                }
                
            }

            else{
                console.log('Damage not found');

                const damage = {
                    name: commanderFound.name,
                    damage: parseInt(args[1])
                }

                playerDamaged.commanderDamage.push(damage);

                if(parseInt(args[1]) >= 21){
                    message.reply(`is out of the game`);

                    playerDamaged.isActive = false;


                }
            }

            playerDamaged.lifeTotal-= parseInt(args[1]);

            if(playerDamaged.lifeTotal <= 0){
                message.reply(`is out of the game`);

                playerDamaged.isActive = false;


            }

            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if (command === "poison") {
            let player = data.players.find(player => player.username == message.author.username);

            player.poisonCounters+= parseInt(args[0]);

            message.reply(`just **got ${args[0]}** poison counters. Their total amount of poison counters is now **${player.poisonCounters}**`);

            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if (command === "cityblessing") {
            let player = data.players.find(player => player.username == message.author.username);

            player.cityBlessing = true;

            message.reply(`now has the **city blessing**`);

            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if (command === "monarch") {
            let player = data.players.find(player => player.username == message.author.username);

            let currentMonarch = data.players.find(player => player.monarch == true);

            if(currentMonarch) currentMonarch.monarch = false;

            player.monarch = true

            message.reply(`is now the **monarch**`);

            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if(command === 'overview'){
            updateSyncDocument(channelId,data);

            gameOverview(message,data.players);
        }

        else if(command === 'start'){
            if(data.gameStarted){
                message.channel.send('Game already started. Please use *!reset* to reset the current game or *!new* to start a new one');
            }

            else{
                data.players = shuffle(data.players);

                let reply = '**Player Order**\n\n';

                for(i in data.players){
                    reply = reply + data.players[i].username + '\n'
                }

                data.gameStarted = true

                message.channel.send(reply);

                message.channel.send("Game dashboard on https://app.bluelionnet.com/?gameId=" + message.channel.id);

                const user = client.users.cache.find(user => user.username == data.players[0].username);

                data.players[0].activeTurn = true;

                message.channel.send(`It's your turn, ${user}`);

                console.log(data.players);

                updateSyncDocument(channelId,data);
            }

        }

        else if(command === 'order'){

            let reply = '**Player Order**\n\n';

            for(i in data.players){
                reply = reply + data.players[i].username + '\n'
            }

            message.channel.send(reply);

        }

        else if(command === 'pass'){

            let activeTurnIndex = data.players.map(player => player.activeTurn).indexOf(true);

            console.log(activeTurnIndex);

        
            var user = client.users.cache.find(user => user.username == data.players[(activeTurnIndex + 1) % data.players.length].username);

            console.log(user);

            data.players[activeTurnIndex].activeTurn = false;
            data.players[(activeTurnIndex + 1) % data.players.length].activeTurn = true;
            
            
            updateSyncDocument(channelId,data);

            message.channel.send(`It's your turn, ${user}`);
        }

        else if(command === 'new'){
            console.log('New Game');

            twilioClient.sync.services(syncService)
            .documents
            .create({uniqueName: channelId, data: {gameStarted: false, counter: 0}, ttl: 86400})
            .then(document => console.log(document.sid))
            .catch(err => { 
                if(err.status === 409){
                    message.channel.send('Game already in place');
                }
            })

            return;
    
        }

        else if(command === 'help'){
            fs.readFile('./help.rd', 'utf8' , (err, data) => {
                if (err) {
                    console.error(err)
                    return;
                }
                message.channel.send(data);
                return;
            })

            
        }
        

    }

    catch(err){
        console.log(err);
    }
});   

client.login(config.BOT_TOKEN);

const shuffle = function (array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
  }

const gameOverview = function(message,players){

        let reply = "**Game Overview**:\n\n"

        for(i in players){
            let colorIdentity = ''
            for(j in players[i].colorIdentity){
                let color = '';
                switch(players[i].colorIdentity[j]){
                    case 'R':
                        color = '🔴';

                        break;

                    case 'B':
                        color = '⚫';

                        break;


                    case 'W':
                        color = '⚪';
    
                        break;

                    case 'U':
                        color = '🔵';

                        break;


                    case 'G':
                        color = '🟢';
    
                        break;

                }

                colorIdentity = colorIdentity + color;

            }

            let commanders = '';

            for(j in players[i].commanders){

                commanders += players[i].commanders[j].name;

                

                if((j + 1) != players[i].commanders.length) {
                    console.log('Not the last One');
                    commanders += ' / ';
                }
            }

            reply = reply + `**${players[i].username}**\n**Commander**: ${commanders}\n**Color Identity**:  ${colorIdentity}\n**Life Total**: ***${players[i].lifeTotal}***\n\n`

            if(players[i].commanderDamage.length > 0) reply = reply + `\n**Commander Damage**\n`

            for(j in players[i].commanderDamage){
                reply = reply + `**${players[i].commanderDamage[j].name}**:  ***${players[i].commanderDamage[j].damage}***\n`
            }

            if(players[i].poisonCounters > 0) reply = reply + `\n**Poison Counters**: ***${players[i].poisonCounters}***\n\n`

            if(players[i].cityBlessing) reply = reply + `**City Blessing**\n`
            if(players[i].monarch) reply = reply + `**Monarch**\n\n`

            reply = reply + '\n';

        }

        message.channel.send(reply);

}

const scryfallRequest = async function(query,message,data,channelId){

        const adjustedQuery = query.replace(' ', '+');

        const commanders = adjustedQuery.split('/');

        let commanderList = [];

        for(i in commanders){
            let requestUrl = `https://api.scryfall.com/cards/named?fuzzy=${commanders[i]}`;

            let resp = await axios.get(requestUrl);

            let commanderCard = resp.data;

            let commanderObj = {
                name: commanderCard.name,
                text: commanderCard.oracle_text,
                manaCost: commanderCard.mana_cost,
                colorIdentity: commanderCard.color_identity
            }

            commanderList.push(commanderObj);

        }

        let colorIdentity = []
        
        for(i in commanderList){
            colorIdentity = colorIdentity.concat(commanderList[i].colorIdentity);

            colorIdentity = colorIdentity.filter((item,index) => colorIdentity.indexOf(item) === index)

        }

        let player = {
            commanders: commanderList,
            username: message.author.username,
            lifeTotal: 40,
            colorIdentity: colorIdentity,
            poisonCounters: 0,
            commanderDamage: [],
            cityBlessing: false,
            monarch: false,
            isActive: true,
            activeTurn: false

        }  

        data.players.push(player);

        let reply = "just joined the game!\n**List of Players**:\n\n**"

        for(i in data.players){
            let colorIdentity = ''
            for(j in data.players[i].colorIdentity){
                let color = '';
                switch(data.players[i].colorIdentity[j]){
                    case 'R':
                        color = '🔴';

                        break;

                    case 'B':
                        color = '⚫';

                        break;


                    case 'W':
                        color = '⚪';
    
                        break;

                    case 'U':
                        color = '🔵';

                        break;


                    case 'G':
                        color = '🟢';
    
                        break;

                }

                colorIdentity = colorIdentity + color;

            }

            let commanders = '';

            for(j in data.players[i].commanders){

                commanders += data.players[i].commanders[j].name;

                

                if((j + 1) != data.players[i].commanders.length) {
                    console.log('Not the last One');
                    commanders += ' / ';
                }
            }

            reply = reply + `**${data.players[i].username}**\n**Commander**: ${commanders}\n**Color Identity**:  ${colorIdentity}\n\n`
            
        }

        message.reply(reply);


        twilioClient.sync.services(syncService)
           .documents(channelId)
           .update({data})
           .then(document => console.log(document.uniqueName));

    }

    const updateSyncDocument = (channelId,data) => {

        twilioClient.sync.services(syncService)
           .documents(channelId)
           .update({data})
           .then(document => console.log(document.uniqueName));

    }