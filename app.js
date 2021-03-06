var express = require('express');
var app = express();
require('express-safe-json')(express);
var http = require('http').Server(app);
var io = require('socket.io')(http);
var helmet = require('helmet');
var hsts = require('hsts');
var xssFilter = require('x-xss-protection');
var express_enforces_ssl = require('express-enforces-ssl');
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
var request = require('request');
var weatherservice;
var sha256 = require('sha256');
var services;
var credentials;
var cloudant;
var database;
var masterPassword= '123';
var cities=["Reutlingen","Stuttgart","Tokyo","Hamburg","Ankara","California"];
var idSelector = {
    selector: {
        "_id": ""
        }
};
//calls the function used to initiate the bluemix noSQL DBAS
servicesInit();

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
app.use(helmet());

app.use(helmet({
    frameguard:false
}));

app.use(xssFilter({setOnOldIE: true }));

app.use(hsts({
    maxAge : 5184000
}));

app.use(helmet.contentSecurityPolicy({
    directives: { 
        defaultSrc: ["'self'"], 
        scriptSrc:["'self'", "https://cdn.socket.io/socket.io-1.4.5.js","'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"], 
        connectSrc: ["'self'", "ws://" + appEnv.url.replace('https://', '')] 
    }, 
        browserSniff: false, 
        setAllHeaders: true 
}));

app.get('/downloads/:filename(*)', function(req, res) {
    var file = req.params.filename;
    var path = __dirname + "/downloads/" + file;
    res.download(path);
});

app.enable('trust proxy');
 
app.use(express_enforces_ssl());

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
                    
                    //Deprecated 
				} else if (msg.substr(0, 7) == '/DEPRECATED'){
                    // Deprecated
                }else if (msg.substr(0, 3) == '/w ') {
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
                     *
                     *added the weather check - parsing the message - if there is a city get the location and the weather
					 */
					if (socket.name !== undefined) {
						if (msg !== "") {
							console.log(time() + " " + socket.name + " : " + msg);
                            var usersInRoom = userInRoom(roomUserlist[socket.name]);
                            var split = msg.split(" ");
                            for(var x = 0; x<usersInRoom.length;x++){
                                if(users[usersInRoom[x]] !== undefined){
                                    users[usersInRoom[x]].emit('chat message', socket.avatar, time() + socket.name + ": " + msg);
                                    for (var i = 0; i < cities.length; i++) {
                                        for (var k = 0; k < split.length; k++) {
                                            if(split[k]===cities[i]){
                                                console.log("i = "+i+" k = "+k);
                                                console.log("city: "+cities[i]+" user: "+users[usersInRoom[x]]);
                                                getLocation(cities[i],users[usersInRoom[x]]);
                                                //users[usersInRoom[x]].emit("server message", cities[i]);
                                            }
                                        }
                                    }
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
              // if the user hasnt a avatar he cant log in
                if(socket.avatar === null || socket.avatar === undefined || socket.avatar === ""){
                    console.log("User hat versucht sich ohne Avatar zu registrieren.");
                    socket.emit('server message', "Bitte laden sie einen Avatar hoch.");
                }
                else{
                    // if he uploads one - checking if its a human
                     var urlstring = socket.avatar.substring(1);
                     urlstring = appEnv.url + urlstring;
                     console.log("check avatar with url: " + urlstring);
                     var params = {url: urlstring};
                       // facerecognition method 
                     facerecognition.detectFaces(params, function(err, result) {                   
                     if (err) {
                         // wenn ein fehler bei der Gesichtserkennung (durch Watson) passiert Mitteilung an den Client
                        console.log(err);   
                        console.log("Fehler bei Watson Gesichtserkennung");
                        socket.emit('server message', "Fehler bei Watson Gesichtserkennung");
                     } else {
                          // wenn es keinen Fehler ergibt bei der Gesichtserkennung
                        console.log("checkavatar no error");
                         console.log(JSON.stringify(result, null, 2));
                        console.log("result: "+result+" result.images[0]: "+result.images[0]+" result.images[0].faces: "+result.images[0].faces);
                           //wenn er ein gesicht erkennt
                        if(result.images[0].faces.length>0){
                            console.log("checkavatar faces.length > 0");
                            console.log("User wurde nicht gefunden! Wird registriert.");
                            //register user wenn er ein gesicht erkennt
                            registerUser(name, hashedPassword, socket.avatar, socket); 
                            roomUserlist[socket.name]=standardRoom;
                            io.emit('server message', name + ' hat sich registriert.');  
                        }else{
                             // kein Gesicht erkannt server sendet nachricht an den client damit er ein Gesicht-Bild hochladen soll
                           console.log("checkavatar faces.length = -1/0");
                           console.log("User hat versucht sich mit einem ungültigen avatar zu registrieren.");
                           socket.emit('server message', "Bild wurde nicht als Mensch erkannt. Bitte laden sie ein GSIIIIICHT hoch.");
                          } 
                        }              
                    });           
                }    
        } else {
            // wenn der User bereits in der Datenbank existiert (LOGIN)
            console.log("User wurde in der Datenbank gefunden!");
            // passwort abfrage - überprüfung durch Datenbankabfrage
            if(resultSet.docs[0].password === hashedPassword){
                socket.name = name;
                 // wenn kein Avatar dann alten verwenden (Path auf DB) oder wenn es der gleiche ist dann auch aus DB verwenden
                if(socket.avatar === undefined || socket.avatar === null || socket.avatar === resultSet.docs[0].avatar){
                    socket.avatar = resultSet.docs[0].avatar;
                    users[socket.name] = socket;
                    userlist.push(name);
                    console.log(time(), name, 'hat sich angemeldet');
                    roomUserlist[socket.name] = standardRoom;
		            io.emit('server message', time() + name + ' signed in');  
                    
                    //New Avatar
                }else{
                    // aus socket avatar lesen 
                    var urlstring = socket.avatar.substring(1);
                     urlstring = appEnv.url + urlstring;
                    var params = {url: urlstring};
                     // facerecognition bekommt als parameter den path bzw url des Bildes - params
                    facerecognition.detectFaces(params, function(err, result) {                   
                     if (err) {
                        console.log(err);   
                        console.log("Fehler bei Watson Gesichtserkennung");
                        socket.emit('server message', "Fehler bei Watson Gesichtserkennung");
                     } else {
                         //Avatar wurde als Gesicht erkannt und user wird eingeloggt
                         console.log("login new avatar: "+result.images[0].faces+" --------");
                          if(result.images[0].faces.length > 0){
                            updateDB(socket.name, socket.avatar);
                            users[socket.name] = socket;
                            userlist.push(name);
                            console.log(time(), name, 'hat sich angemeldet');
                            roomUserlist[socket.name] = standardRoom;
		                    io.emit('server message', time() + name + ' signed in');     
                          }else{
                              // neuer Avatar enthält kein Gesicht! Altes wird verwendet
                              socket.emit('server message', "Der neue Avatar ist nicht regelkonform. Der alte Avatar bleibt bestehen.");
                              socket.avatar = resultSet.docs[0].avatar;
                              users[socket.name] = socket;
                              userlist.push(name);
                              console.log(time(), name, 'hat sich angemeldet');
                              roomUserlist[socket.name] = standardRoom;
		                      io.emit('server message', time() + name + ' signed in');  
                          }
                     }
                    });
                }
                              
            }else{
                // username already taken or wrong password
                socket.emit('server message', "Login failed: Username already taken or wrong Password. Please reload the page and choose a different name or enter the correct password.");
                }
         }
     });   
    });   
    // checking the inputed masterpassword
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
     // function to get the avatar saving the path on the socket.avatar 
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
// function to update the DB
function updateDB(name, avatarurl){
    idSelector.selector._id = name;
    database.find(idSelector, function(error, resultSet) {
        var id = resultSet.docs[0]._id;
        var rev = resultSet.docs[0]._rev;
        database.insert({_id: id, _rev: rev, avatar: avatarurl}, function(err, body) {});
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
//checks if the avatar at url is human
function checkAvatar(urlstring){
    
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
      
        return targetUsers;
    }
    //initializes the cloudant nosqldbas within the applications environment
    function servicesInit(){
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
        
         // initializes the Visual Recognition Service
        var visualRecognitionService = services['watson_vision_combined'];
        for (var service in visualRecognitionService) {
            if (visualRecognitionService[service].name === 'visualrecognition') {
                facerecognition = new VisualRecognitionV3({
                    api_key: visualRecognitionService[service].credentials.api_key,
                    version_date: '2016-05-20'
                });
            }
        }
        // credentials of weatherservice
        var weatherservice = {
                    "weatherinsights": [
                    {
                        "credentials": {
                        "username": "bea06ee8-448b-4d6c-ac0d-8561ea9d3c01",
                        "password": "MAeHtQD50F",
                        "host": "twcservice.mybluemix.net",
                        "port": 443,
                        "url": "https://bea06ee8-448b-4d6c-ac0d-8561ea9d3c01:MAeHtQD50F"
                        }
                    }]
        }
    }
 // function to get location (latitude, longitude) of the city
    function getLocation(location, users){
        console.log("getlocation " + location);
        request('https://bea06ee8-448b-4d6c-ac0d-8561ea9d3c01:MAeHtQD50F@twcservice.mybluemix.net/api/weather/v3/location/search?query=' + location+"&language=en-US", function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var resjson = JSON.parse(response.body);
                var lat = resjson.location.latitude[0];
                var lon = resjson.location.longitude[0];
                getWeatherIcon(lat, lon, location, users);
                console.log("location data lat: "+lat + " long: "+lon);
            }else{
                console.log("An error happened while trying to get location");
            }
        });
    }
       // getting the iconID of the current weather with the latitude and longitude of the location and sending it to the chat
    function getWeatherIcon(latitude, longitude, location, users){
        console.log("get weathericon lat:"+ latitude + " long:" + longitude);
         request('https://bea06ee8-448b-4d6c-ac0d-8561ea9d3c01:MAeHtQD50F@twcservice.mybluemix.net/api/weather/v1/geocode/'+latitude+'/'+longitude+'/observations.json?language=en-US', function (error, response, body){
             if (!error && response.statusCode == 200) {
                var resjson = JSON.parse(response.body);
                var iconID = resjson.observation.wx_icon;
                console.log("icon ID:" + iconID);
                //sending the ID of the icon and the location to all client
                users.emit('wetter event', location, iconID);
                
            }else{
                console.log("An error happened while trying to get weather data");
            }
         });
    }
    //unsubscribes a sockets room
    function leaveRoom(socket){
        roomUserlist[socket.name].remove();
    }

