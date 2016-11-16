var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
/*sockets are mapped by socket names*/
var users = {};
/*users to post the userlist*/
var userlist = [];
var standardRoom = 'standardRoom';
var roomlist = [standardRoom];
var roomUserlist={};
/*filestream*/
var fs = require('fs');
/*stream*/
var ss = require('socket.io-stream');
/*path*/
var path = require('path');
var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();

http.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

/*binding the public folder for static files
 * 
 */
app.use(express.static(__dirname + '/public'));
/*
 * '/' routing handler for the side
 */
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});
/*
 * to download the files response the path
 */
app.get('/downloads/:filename(*)', function(req, res) {
    var file = req.params.filename;
    var path = __dirname + "/downloads/" + file;
    res.download(path);
});

io.on('connection', function(socket){
/*
 * handling the chat message event, getting the messagee and triming it to avoid unnessecery whitespaces. 
 * after that creating a substring from the first 5 letters, if its '/list' the user gets a list with all Users
 * and the socket(Client) gets an emit, with the event chat message and the list of the users.
 */
	  socket.on('chat message',
			function(msg) {
				msg = msg.trim();
				if (msg.substr(0, 5) == '/list') {
					var listOfUsers = getUserlist();
					console.log(socket.name + " hat /list ausgefuehrt");
					if (socket.name !== undefined) {
						socket.emit('chat message', listOfUsers);
					}
					/*
					 * if the substring of the first 3 letters are the same as '/w' the users wants to whisper to another user
					 * removing the /w and splitting the message by blank the first substring is the user which will get the whisper
					 * the user cant whisper himself, checking this by nameToSendMessaageTo!==socket.name
					 * then getting all the splitted messages together and sending it to the user if user exists
					 * the user which sended the message gets a message that he has sended the message to the user with the message
					 */
				} else if (msg.substr(0, 3) == '/w ') {
					if (socket.name !== undefined) {
						msg = msg.substr(3); // this removes the '/w ' string
						var split = msg.split(" ");
						var nameToSendMessageTo = split[0];
						if (nameToSendMessageTo !== socket.name) {
							var messageToSend = "";
							for (var i = 1; i < split.length; i++) {
								console.log(split[i]);
								messageToSend += " " + split[i];
							}
							console.log(nameToSendMessageTo);

							if (users[nameToSendMessageTo] !== undefined) {
								users[nameToSendMessageTo].emit('chat message', time() + "from " + socket.name + ": "+ messageToSend);
								socket.emit('chat message', time() + "to "+ nameToSendMessageTo + ": "+ messageToSend);
							}
							/*
							 * User gets this message if he wants to whisper to himself
							 */
						} else {
							socket.emit('chat message', time()
									+ "you can't text to yourself!")
						}
					}
				}else if(msg.substr(0,3) == '/j '){
                    if(socket.name!==undefined) {
                        msg = msg.substr(3);
                        var split = msg.split(" ");
                        var chatRoomName = split[0];
                        if(roomlist.indexOf(chatRoomName) > -1){
                            roomUserlist[socket.name]=chatRoomName;
                            console.log("User hat versucht einen Raum zu erstellen der bereits existiert");
                        }else {
                            roomlist.push(chatRoomName)
                            roomUserlist[socket.name]=chatRoomName;
                            console.log("User hat einen neuen Raum erstellt");
                        }
                        socket.emit('chat message',"raum wurde erstellt.");
                        socket.emit('clearChat', chatRoomName+" wird beigetreten");
                    }                    
                } else {
					/*
					 *to send a message to all in the room just adding time and the name of the user by reading it out from the socket 
					 */
					if (socket.name !== undefined) {
						if (msg !== "") {
							console.log(time() + " " + socket.name + " : " + msg);
                            var usersInRoom = userInRoom(roomUserlist[socket.name]);
                            for(var i = 0; i<usersInRoom.length;i++){
                                if(users[usersInRoom[i]] !== undefined){
                                users[usersInRoom[i]].emit('chat message', time() + socket.name + ": " + msg); 
                                }
							}
						}
					}
				}
			});
    
	  
	  /*
	   * getting the name of the user as param and registering him on the system
	   * all users are getting a message that the user signed in
	   */
	socket.on('login', function(name) {
		registerName(name, socket);
		console.log(time(), name, 'hat sich angemeldet');
        roomUserlist[socket.name] = standardRoom;
		io.emit('chat message', time() + name + ' signed in');
	});
	
	/*
	 * disconnect event when losing session or smth, checking if the socket is registred and then deleting the user from the map
	 * emiting a message to all that the user left
	 */
	socket.on('disconnect', function() {
		if (socket.name !== undefined) {
			delete users[socket.name];
			delete roomUserlist[socket.name];
            deleteUserFromList(socket.name);
			console.log(time(), socket.name, 'hat sich abgemeldet');
            io.emit('chat message', time() + socket.name + ' signed out');
		}
	});
	  
	/*
	 * function of the wrapped socket which listens on the event 'file'
	 * creating a pipe from the stream creating a filestream and writing the file into it
	 * sending the link information to all clients/users/sockets with the name time and the user which send the file/link
	 */
	  ss(socket).on('file', function(stream, data) {
		  if(socket.name!== undefined){
		    var filename = __dirname + "/downloads/" + path.basename(data.name);
		    stream.pipe(fs.createWriteStream(filename));
		    console.log(time()+socket.name+": hat "+data.name+" versendet");
		    io.emit('file', {name: data.name, time: time(),socketName: socket.name});
		}});
	  
	});
/*
 * to listen on port 3000
 */

/*
 * function to register a client by name and socket
 * adding the name to the socket and adding the socket to a map by giving the name as key
 * then pushing the clientname to the userlist
 */
function registerName(name, clientSocket){
	clientSocket.name = name;
	users[clientSocket.name] = clientSocket;
	userlist.push(clientSocket.name);
}

/*
 * function to get the current time 
 */
function time(){
	var date = new Date();
	var hours;
	var minutes;
	var seconds;
	var time='';
	if(date.getHours()<10){
		hours = '0' + date.getHours();
	}else{
		hours = date.getHours();
	}
	if(date.getMinutes()<10){
		minutes = '0' + date.getMinutes();
	}
	else{
		minutes = date.getMinutes();
	}
	if(date.getSeconds()<10){
		seconds = '0' + date.getSeconds();
	}
	else{
		seconds = date.getSeconds();
	}
		time += hours + ':' + minutes + ':' + seconds+" | ";
	
		return time;
	}
/*
 * function to getting all the users from the list which are logged in
 */
	function getUserlist(){
		var string = time()+'Signed in User: ';
		for (var i = 0; i< userlist.length; i++){
			string += ' | ' + userlist[i];
		}
        string += " || Current Rooms: "
        for (i = 0; i< roomlist.length; i++){
            string += ' | ' + roomlist[i];
        }
		return string;
	}
	
	/*function to delete a user from the list which is used to show the list for the clients/users
	 * deleteUser is the user which has to be delet
	 * 
	 *
	 */
	function deleteUserFromList(deleteUser){
		var userToDelete;
		for(var i = 0; i< userlist.length; i++){
			userToDelete = userlist[i]
			if(userToDelete==deleteUser){
				userlist.splice(i,1);
			}
		}
	}

    function userInRoom(roomName){
        var targetUsers = [];
        for(var key in roomUserlist){
            if (roomUserlist[key] == roomName){
                targetUsers.push(key);
            }
        }
       // for (var it = 0; it < targetUsers.length; it++){
         //   console.log(targetUsers[it]);
       // }
        return targetUsers;
    }
    
    function leaveRoom(socket){
        roomUserlist[socket.name].remove();
    }
    function clearRooms(){
        roomlist = [];
    }

