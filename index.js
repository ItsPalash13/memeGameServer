const express = require('express')
const redis = require('redis');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express()

//const http = require('http').createServer(app);
const { createServer } = require("http");
const { Server } = require("socket.io");
const { clearInterval } = require('timers');

const port = 3002
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

let timerInterval;


io.on('connection', (socket) => {
  console.log('A user connected');
  var udata={}
  var uinfor={};
 
  socket.on('start', async (data) => {
 
      const {maxep,maxtime}=data;
      const gameState = { gamestate: data };
  
      console.log('Started Game', data.room,JSON.stringify(gameState));  
      client.json.set(data.room,"gamestate",{state:"started",curep:1,maxep:maxep,maxtime:maxtime,curimg:"",scores:{},playerdata:{}});

      await Reinitiate(data.room);
      io.to(data.room).emit('start', {start:true,maxep:maxep,maxtime:maxtime,curep:1});
      await GamestepCaptioning(data.room);
    
    
  });

  socket.on('caption', async (data) => {
    const {user,room,caption,ep}=data;
    await client.json.del(room,"gamestate.playerdata."+user);
    console.log(user+".cap"+"."+ep)
    await client.json.set(room,user+".cap",{[ep]:caption});
    
    checkTotalCaptions(room);
    
  });

  socket.on('sendscore', async (data) => {
    delete data.p.gamestate;   
    await client.json.set(data.r,"gamestate.scores."+data.u,data.p);

    for (const i in data.p){
      client.json.NUMINCRBY(data.r,i+".score",data.p[i].score)
    }
    json = await client.json.get(data.r);
    s=json.gamestate.scores
    delete json.gamestate

    checkTotalRatings(data.r)
    
  });

  socket.on('gamestate', async (data) => {
    const {room}=data;
    const udata = await client.json.get(room);
    if (udata && udata.hasOwnProperty('gamestate')){
      if (udata.gamestate.state==="showingimg"){
        io.to(socket.id).emit('gamestate', {state:"showingimg",curep:udata.gamestate.curep,maxep:udata.gamestate.maxep,maxtime:udata.gamestate.maxtime});
        io.to(socket.id).emit('gamestepcaptioning', {img:udata.gamestate.curimg});
      }
      else if (udata.gamestate.state==="ratingimg"){
        io.to(socket.id).emit('gamestate', {state:"ratingimg",curep:udata.gamestate.curep,maxep:udata.gamestate.maxep,maxtime:udata.gamestate.maxtime,curimg:udata.gamestate.curimg});
        io.to(socket.id).emit('gamesteprating', {data:udata});
      }
      else if (udata.gamestate.state==="endgamestep"){
        io.to(socket.id).emit('gamestate', {state:"endgamestep",curep:udata.gamestate.curep,maxep:udata.gamestate.maxep,maxtime:udata.gamestate.maxtime,curimg:udata.gamestate.curimg});
        delete udata.gamestate;
        io.to(socket.id).emit('endgamestep', {data:udata,ep:ep});
      }
      else if (udata.gamestate.state==="endgame"){
        io.to(socket.id).emit('gamestate', {state:"endgame",curep:udata.gamestate.curep,maxep:udata.gamestate.maxep,maxtime:udata.gamestate.maxtime,curimg:udata.gamestate.curimg});
        delete udata.gamestate;
        io.to(socket.id).emit('endgame', {data:udata,ep:ep});
      }
    }
    else{
      io.to(socket.id).emit('gamestate', {state:"notstarted"});
    }
  });

  socket.on('join', async ({room,user,uinfo,ishost}) => {
    uinfor=uinfo
    udata={room:room,user:user} 
    console.log('A user joined',udata);
    console.log(`Socket ${socket.id} joining ${room} user ${user} info ${uinfo}`);
 
    if (ishost===true){
      client.json.set(room, ".", {[user]:{ishost:ishost,uinfo:uinfor,score: 0,cap: null}});
    }
    else{
     client.json.set(room, user, {ishost:ishost,uinfo:uinfor,score: 0,cap: null});
   
      
    }    
    try{await client.json.set(room,"gamestate.playerdata."+user,{});} catch{}
    socket.join(room);
    result = await fetchData(room); 
    io.to(room).emit('playerlistcheck', result);
 });

  socket.on('disconnect', async () => {
    console.log('A user disconnected',udata);
    result = await deleteData(udata.room,udata.user);
    publisher.publish('Channel1', JSON.stringify({cmd:"delplyr",data:{room:udata.room,p:udata.user}}));
    
    try {
      io.to(udata.room).emit('playerlistcheck', result.data);
      if (result&&result.ep&&Object.keys(result.data).length==2){
        console.log("Endsssss")
        clearInterval(timerInterval)
        await client.json.set(udata.room,"gamestate.state","endgame");
        
        io.to(udata.room).emit('endgame', {data:result.data,ep:result.ep});
        return;
      }
    } catch (error) {}

    const ud = await client.json.get(udata.room);
    let s;
    if (ud !== null && ud.hasOwnProperty("gamestate")) {
      await client.json.del(udata.room,"gamestate.playerdata."+udata.user);
      s=ud.gamestate;
      delete ud.gamestate;
    }
    if(s && s.state==="showingimg"){

      checkTotalCaptions(udata.room);
    }
    else if(s && s.state==="ratingimg"){

      checkTotalRatings(udata.room);
    }
    
  });

});
const tags = [["arpitbala",12],["craig ferguson",20]]
const tagslength=2
async function Reinitiate(room) {
  try {
    const t = Math.floor(Math.random()*tagslength)

    const response = await axios("https://tenor.googleapis.com/v2/search?key=AIzaSyBkDP4GVAUGNkg8zGXz-8p5kTq6Hcy3uVA&q="+tags[t][0]);
    const data = await response.data;
    
    const gifs = data.results[Math.floor(Math.random() * tags[t][1])].media_formats.mp4.url
    await client.json.set(room,"gamestate.curimg",gifs);
     
    const ud = await client.json.get(room);
    delete ud.gamestate;
    await client.json.set(room,"gamestate.playerdata",ud);


  } catch (error) {
    console.log('Error:', error);
  }
  
}

async function GamestepRating(room) {
  console.log("GamestepRating",room)
  try{
  const data = await client.json.get(room);
  if (data&&data.gamestate&&data.gamestate.state&&data.gamestate.state==="endgame"){return}
  s=data.gamestate.playerdata
  delete data.gamestate;
  var f=0
  for (const i in data){
 
      if (!s[i]){
         f=1
         break}}
  if (f==0){

    calculate_send_set_reset_score(room)
    return
  } 

  await client.json.set(room,"gamestate.state","ratingimg");
  io.to(room).emit('gamesteprating', {data:data});

  let timerData = 45;
  clearInterval(timerInterval);
  timerInterval = setInterval( async () => {
    io.to(room).emit('time', timerData);
    timerData=timerData-1;
    if (timerData === -1) {
      clearInterval(timerInterval);
      calculate_send_set_reset_score(room);
    }
  }, 1000);
  }
  
  catch{
    console.log("Terminated on GamestepRating")
  };
  
}

async function GamestepCaptioning(room) {
  console.log("GamestepCaptioning",room)
  const data = await client.json.get(room);
  if (data&&data.gamestate&&data.gamestate.state&&data.gamestate.state==="endgame"){return}
  await client.json.set(room,"gamestate.state","showingimg");
  io.to(room).emit('gamestepcaptioning', {img:data.gamestate.curimg});

    let timerData = data.gamestate.maxtime;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      io.to(room).emit('time', timerData);
      timerData=timerData-1;
      if (timerData === -1) {
        clearInterval(timerInterval);
        GamestepRating(room);
      }
    }, 1000);
 
}

async function checkTotalCaptions(room) {
  const ud = await client.json.get(room);
  data=ud
  if (data&&data.gamestate&&data.gamestate.state&&data.gamestate.state==="endgame"){return}
  try{
    for(var i in ud.gamestate.playerdata) {
      return; 
     }
  }
  catch{}
  clearInterval(timerInterval);
  GamestepRating(room);
}

async function checkTotalRatings(room) {
  const ud = await client.json.get(room);
  data = ud
  if (data&&data.gamestate&&data.gamestate.state&&data.gamestate.state==="endgame"){return}
  let s;
  if (ud !== null && ud.hasOwnProperty("gamestate")) {
         s=ud.gamestate;
         delete ud.gamestate;
      }
  const p=ud;
  var f=0
  if (emptyjson(s.scores)==1){
    clearInterval(timerInterval);
    calculate_send_set_reset_score(room);
    return
  }
  for (const i in p){ 
    if(!s.scores[i]){
      f=1;
      break
    }
  }
  if(f==0){
    clearInterval(timerInterval);
    calculate_send_set_reset_score(room);
  }
}

function emptyjson(j){
  for (var i in j){
    return 0;
  }
  return 1;
}

async function calculate_send_set_reset_score(room) {
  json = await client.json.get(room);
  data = json
  if (data&&data.gamestate&&data.gamestate.state&&data.gamestate.state==="endgame"){return}
  maxep=json.gamestate.maxep
  ep=json.gamestate.curep
  g=json.gamestate.scores
  delete json.gamestate;

  await endgamestep(maxep,ep,room,json);

}


async function endgamestep(maxep,ep,room,json){
  await client.json.set(room,"gamestate.scores",{});
  await client.json.set(room,"gamestate.curep",ep+1);

  if(maxep==ep){
   
    await client.json.set(room,"gamestate.state","endgame");
    io.to(room).emit('endgame', {data:json,ep:ep});
    
    return;
  }
  io.to(room).emit('endgamestep', {data:json,ep:ep+1});
  setTimeout(async () => {
      console.log("Restart")
      await Reinitiate(room);
      await GamestepCaptioning(room);
  }, 3000);
}

async function fetchData(room) {  
  const data = await client.json.get(room);
  return data;
}

async function deleteData(room,user) {
  const data = await client.json.get(room);
  
  var s;
  if (data && data.hasOwnProperty('gamestate')) {
    s=data.gamestate
    delete data.gamestate;
  }
  if (data && data[user]){
    const keys = Object.keys(data);
    if (keys.length===1){
      client.json.del(room);
      return data
    }
    if (data[user].ishost===true){
      delete data[user];
      client.json.del(room,user);
      const keys = Object.keys(data);
      if (keys.length>0){
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        data[randomKey].ishost = true;
        client.json.set(room, randomKey, data[randomKey]);
      }
    }
    else{
      delete data[user];
      client.json.del(room,user);
    }
  }
  if (s!==undefined){
    return {data:data,ep:s.curep};
  }
  else{
    return {data:data};
  }
  


}


httpServer.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
    
  });

const client = redis.createClient({
    socket:{
    host: 'redis-14242.c212.ap-south-1-1.ec2.cloud.redislabs.com',
    port: 14242},
    username: 'default',
    password: 'i3haNf9pcuzokuc7pGmVmNz7TA4dRtiF',
  });
client.connect();
const subscriber = client.duplicate();
const publisher = client.duplicate();
publisher.connect();
(async () => {
  await subscriber.connect();
  await subscriber.subscribe('Channel2', (message) => {
    json = JSON.parse(message)// 'message'
  
    if (json.cmd==="create") {
  
      const newObject = {
        [json.data.p]: { score: 0, rounds: {} }
      };
      //client.json.set(json.data.room, ".", newObject);
     
    }
    else if(json.cmd==="update") {
      console.log("Room", json.data.room);
      const updatedObject = {
        score: 0,
        rounds: {}
      };
      console.log("HelloBro");
      //client.json.set(json.data.room, json.data.p, updatedObject);
    }

  });
})();

client.on('connect', () => {
    console.log('Connected to Redis Cloud');
  });
  
client.on('error', (error) => {
    console.error('Error connecting to Redis:', error);
  });
  
