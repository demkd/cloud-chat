var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
/*sockets are mapped by socket names*/
var users = {};
/*users to post the userlist*/
var userlist = [];
var userPasswords = {};
var standardRoom = 'standardRoom';
var roomlist = [standardRoom];
var roomUserlist={};
var roomPasswordlist={};
/*filestream*/
var fs = require('fs');
/*stream*/
var ss = require('socket.io-stream');
/*path*/
var path = require('path');
var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();

// Load the Cloudant library.
var Cloudant = require('cloudant');
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
var facerecognition;
var sha256 = require('sha256');
var services;
var credentials;
var cloudant;
var database;
var masterPassword= '123';
var idSelector = {
    selector: {
        "_id": ""
        }
};
//calls the function used to initiate the bluemix noSQL DBAS
cloudantInit();

//gets the port from the bluemix environment
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
						socket.emit('server message', listOfUsers);
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
                                
                                users[nameToSendMessageTo].emit('chat message', socket.avatar, time() + "from " + socket.name + ": " + messageToSend);
                                
								socket.emit('chat message', socket.avatar, time() + "to "+ nameToSendMessageTo + ": "+ messageToSend);
							}
							/*
							 * User gets this message if he wants to whisper to himself
							 */
						} else {
							socket.emit('server message', time()
									+ "you can't text to yourself!")
						}
					}
                    /*
                     * checks if the message sent by the character is a join room command
                     * if it is, check if there is a room of equal name and compare passwords or create a new room with the password input
                     */
				}else if(msg.substr(0,3) == '/j '){
                    if(socket.name!==undefined) {
                        msg = msg.substr(3);
                        var split = msg.split(" ");
                        var chatRoomName = split[0];
                        var chatRoomPassword = split[1];
                        if(roomlist.indexOf(chatRoomName) > -1){
                            if(roomPasswordlist[chatRoomName] === chatRoomPassword){
                            roomUserlist[socket.name]=chatRoomName;
                            console.log("User hat versucht einen Raum zu erstellen der bereits existiert");
                            socket.emit('server message',"new room created");
                            socket.emit('clearChat', "joining: "+chatRoomName);
                            }else{
                                roomUserlist[socket.name]=standardRoom;
                                console.log("hat falsches PW für den Raum eingegeben.");
                                socket.emit('server message', 'Wrong Password. You have been moved back to the standard room.');
                                 }
                        }else {
                            roomlist.push(chatRoomName)
                            roomPasswordlist[chatRoomName] = chatRoomPassword;
                            roomUserlist[socket.name]=chatRoomName;
                            console.log("User hat einen neuen Raum erstellt");
                            socket.emit('server message',"new room created"); 
                            socket.emit('clearChat', "joining: "+chatRoomName);
                        }
                        
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
                                users[usersInRoom[i]].emit('chat message', socket.avatar, time() + socket.name + ": " + msg); 
                                }
							}
						}
					}
				}
			});
    
	  
	  /*
       * first of all hashes the password by way of sha256
	   * checks if the username is already in the database
       * if true compares the hashed password with the password in the db and then establishes name - socket connection
       * else writes the new login data into the db
	   * all users are getting a message that the user signed in/registered
       *
	   */
	socket.on('login', function(name, password) {
		var hashedPassword = sha256(password);
        //selector gets the ID(LoginName)
        idSelector.selector._id = name;
        //searching in the database
        database.find(idSelector, function(error, resultSet) {
        if (resultSet.docs.length == 0) {
                if(socket.avatar === null || socket.avatar === undefined || socket.avatar === ""){
                    console.log("User hat versucht sich ohne Avatar zu registrieren.");
                    socket.emit('server message', "Bitte laden sie einen Avatar hoch.");
                }
                else{
                    if(){
                        console.log("User wurde nicht gefunden! Wird registriert.");
                        registerUser(name, hashedPassword, socket.avatar, socket); //pruefen
                        roomUserlist[socket.name]=standardRoom;
                        io.emit('server message', name + ' hat sich registriert.');    
                    }else{
                       socket.emit('server message', "Bild wurde nicht als Mensch erkannt. Bitte laden sie ein GSIIIIICHT hoch.");
                    }
                }    
        } else {
            console.log("User wurde in der Datenbank gefunden!");
            if(resultSet.docs[0].password === hashedPassword){
                socket.name = name;
                socket.avatar = resultSet.docs[0].avatar;
                users[socket.name] = socket;
                userlist.push(name);
                console.log(time(), name, 'hat sich angemeldet');
                roomUserlist[socket.name] = standardRoom;
		        io.emit('server message', time() + name + ' signed in');                
            }else{
                socket.emit('chat message', "Login failed: Username already taken or wrong Password. Please reload the page and choose a different name or enter the correct password.");
            }
         }
     });   
    });   
    
    socket.on('securePW', function(password){
        if(password === masterPassword){
            socket.emit('masterPassword');
            console.log("Secure Password was right!! "+masterPassword);
        }else{
            console.log("Secure Password was NOT RIGHT!! "+masterPassword+" password eingetippt: "+password);
        }
    });
        
        
	/*
	 * disconnect event when losing session or smth, checking if the socket is registred and then deleting the user from the map
	 * emiting a message to all that the user left
	 */
	socket.on('disconnect', function() {
		if (socket.name !== undefined) {
			delete roomUserlist[socket.name];
            deleteUserFromList(socket.name);
			console.log(time(), socket.name, 'hat sich abgemeldet');
            io.emit('server message', time() + socket.name + ' signed out');
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
    
      ss(socket).on('avatar', function(stream, data) {
		    var filename = "./downloads/" +  path.basename(data.name);
		    stream.pipe(fs.createWriteStream(filename));
		    console.log(time()+socket.name+": hat "+data.name+" avatar hochgeladen");
		    socket.avatar = filename;
		});
	  
	});

//simple fire-and-forget function that writes the input into the cloudant db
function writeToDB(name, password, avatarurl){
    console.log("writing to DB new User");
     database.insert({_id: name, password: password, avatar: avatarurl}, function(error, body) {
        if (error) {
            throw error;
        }
        console.log('####Created design document '+body);
        });
}

//if a new user is to be registered, the name and password get entered into the db and the name - socket connection is saved on the server
function registerUser(name, password, avatarurl, clientSocket){
        writeToDB(name, password, avatarurl);
        clientSocket.name = name;
        users[clientSocket.name] = clientSocket;
        userPasswords[name]=password;
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
    //returns all the users that are in a room specified by name
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
    //initializes the cloudant nosqldbas within the applications environment
    function cloudantInit(){
        if (process.env.VCAP_SERVICES) {
        services = JSON.parse(process.env.VCAP_SERVICES);

        var cloudantService = services['cloudantNoSQLDB'];
        for (var index in cloudantService) {
            if (cloudantService[index].name === 'datenbank') {
                credentials = cloudantService[index].credentials;
            }
        }
        cloudant = Cloudant(credentials.url);
        }
        
        
        if (cloudant !== null && cloudant !== undefined) {
            database = cloudant.db.use('usernameandpasswords');
        }
        
        
        var visualRecognitionService = services['watson_vision_combined'];
        for (var service in visualRecognitionService) {
            if (visualRecognitionService[service].name === 'visual-recognition') {
                facerecognition = new VisualRecognitionV3({
                    api_key: visualRecognitionService[service].credentials.api_key,
                    version_date: '2016-05-20'
                });
            }
        }
    }

    //unsubscribes a sockets room
    function leaveRoom(socket){
        roomUserlist[socket.name].remove();
    }

