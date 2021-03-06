$(document).ready (function() {
	
  var io = require('socket.io-client');
  var ss = require('socket.io-stream');

  var socket = io();
  
  /*function to send the message to server */
  $('#chatform').submit(function(){
    socket.emit('chat message', $('#m').val());
    $('#m').val('');
    return false;
  });
  /* function to recive the message(client messages) from server */
  socket.on('chat message', function(avatarurl, msg){
      var avatar = new Image(64,64);   
      avatar.src = avatarurl;
      $('#messages').append($('<li>'));
      $('#messages').append(avatar);
      $('#messages').append(msg);
  });
    
    // function to recive the message from server
  socket.on('server message', function(msg){
      $('#messages').append($('<li>'));
      $('#messages').append(msg);
  })
  
  /* function to login the User 
   * if the users submits something the value of the name field will be send to the server.
   *  After that the login will form will be hide and chatform will be shown and the name field will be cleared
   *  */

  $('#loginform').submit(function() {
    console.log($('#avatar'));
      //console.log("valid avatar: " + checkIfImage($('#avatar').));
    socket.emit('login', $('#name').val(), $('#password').val());
    $('#name').val('');
    $('#login').hide();
    $('#chat').show();
    return false;
  });
    
    
    /*
    * function to login with the master pw to the chatapp
    */
   $('#securePWform').submit(function() {
    socket.emit('securePW', $('#securePassword').val());
    $('#securePassword').val('');
    console.log("Master Password abgesendet!");
    return false;
  });
    
    //Masterpassword check erfolgreich:
    socket.on('masterPassword', function(){
        console.log("Clientside Event angekommen!");
        $('#securePW').hide();
        $('#login').show();
    });
  
  /*function to send a file, creating new stream and opening pipe with a wrapped socket.
   * Emiting it to the server with the size of the file and the name of the file and the stream
   * 
   */
  $('#file').change(function(e) {
	    var file = e.target.files[0];
	    var stream = ss.createStream();
	    // upload a file to the server.
	    ss(socket).emit('file', stream, {size: file.size, name: file.name});
	    ss.createBlobReadStream(file).pipe(stream);
  });
    
    //avatar wird hochgeladen 
  $('#avatar').change(function(e) {
        console.log("avatar hochgeladen");
	    var file = e.target.files[0];
	    var stream = ss.createStream();
	    ss(socket).emit('avatar', stream, {size: file.size, name: file.name});
	    ss.createBlobReadStream(file).pipe(stream);
  });
    
    //clearing the chat
    socket.on('clearChat', function(data){
        $('#messages').empty();
        $('#messages').append($('<li>').text(data));
    });
    
    //wetter event um das Bild im chat anzuzeigen
     socket.on('wetter event', function(city,iconID){
         var wetterIcon = new Image(201,200);
         wetterIcon.src = "./downloads/icon" + iconID + "\.png";
         $('#messages').append($('<li>'));
         $('#messages').append($('<li>').text("Das Wetter für: "+city+" "));
         $('#messages').append(wetterIcon);
         $('#messages').append($('</li>'));
    });
  
  /*
   * function to post the file link,
   * the link will be posted into the chat as a list object and will get the dataname over the data param
   */
  socket.on('file', function(data) {
	 if(checkIfImage(data.name)){
         var upimage = new Image(256,256);
         upimage.src = "./downloads/" + data.name;
         $('#messages').append($('<li>'));
         $('#messages').append(upimage);
         $('#messages').append($('</li>'));
     }else{
         $('#messages').append($('<li>').append($('<a href="./downloads/' + data.name +  '"target="_blank">').text(data.time+data.socketName+": "+data.name)));
     }
  });

    /*
    *checking if the uploaded file is a picture 
    *
    */
   function checkIfImage(url){
     var dataName = url+"";
     var split = url.split(".");
     if(split[1] === "png" || split[1] === "jpg" || split[1] === "bmp" || split[1] === "gif" ){
        return true;
        }
       return false;
   }
});

