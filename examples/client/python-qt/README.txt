this client interprets /list commands and join/leave messages to fill a list of users online
it also sends /list as the user upon connecting
this is pretty untypical but its actually pretty good practice if you want something like this

you can edit the ui with qt editor (file is ui.ui)
this also generates a json file called servers.json when you add/remove servers
itll just regen servers.json with the default public chatserver if its empty tho