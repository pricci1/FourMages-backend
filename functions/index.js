const functions = require("firebase-functions");

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
const admin = require("firebase-admin");
admin.initializeApp();

// exports.removeInvite = functions.database
//   .ref("/users/{userId}/friends/{friendId}")
//   .onCreate((snapshot, context) => {
// const userId = context.params.userId;
// const friendId = context.params.friendId;
// function getKeyByValue(object, value) {
//   return Object.keys(object).find(key => object[key] === value);
// }
//     admin
//       .database()
//       .ref(`/invites/${userId}`)
//       .once("value")
//       .then(snap => {
//         const inviteKey = getKeyByValue(snap.val(), friendId);
//         return admin
//           .database()
//           .ref(`/invites/${userId}/${inviteKey}`)
//           .remove();
//       });
//   });

const emailToId = email => email.replace(".", ",");
const idToEmail = email => email.replace(",", ".");

const playersCount = 4;

exports.getInvites = functions.https.onCall(async (data, context) => {
    const userUid = strClean(data.uid);
    console.log(userUid);
  
    var invites = [];

    await admin
      .database()
      .ref(`/users/${userUid}/invites`)
      .once("value").then(snap => {
        invites =snap.val();
      });
    console.log("Invites: ", invites);
  
    return invites
  
  });

exports.getFriends = functions.https.onCall(async (data, context) => {
    const userUid = strClean(data.uid) || context.auth.token.uid || null;
  
    var friends = [];
  
    await admin
      .database()
      .ref(`/users/${userUid}/friends`)
      .once("value").then(snap => {
        friends = snap.val();
      });
    console.log("Friends: ", friends);
  
    return friends || {};
  
  });

function objectHasValue(obj, value) {
  if (obj && value) {
    console.log("obj", obj);
    console.log("value", value);
    var found = Object.values(obj).find(val => val.replace(/[^a-zA-Z0-9 -]/i, "") === value);
    if (found) {
    return value.replace(/[^a-zA-Z0-9 -]/i, "") === found.replace(/[^a-zA-Z0-9 -]/i, "");
  }
  }
  return false;
}

exports.sendFriendRequest = functions.https.onCall(async (data, context) => {
  const requesterUid = strClean(data.requesterUid) || context.auth.token.uid || null;
  const invitedEmail = strClean(data.accepterEmail);
  var invitedUid = await getUidFromEmail(strClean(invitedEmail));
  console.log(invitedUid);
  invitedUid = strClean(invitedUid);
  console.log("Invited uid: ", invitedUid);
  var requesterEmail = await getUserEmail(requesterUid);
  requesterEmail = strClean(requesterEmail);
  console.log("Requester: ",requesterUid, requesterEmail);



  if (requesterUid === invitedUid) {
    return {success: false};
  }

  const usersRef = admin.database().ref(`/users`);

  var requesterFriends = {};
  var invitedRequests = {};
  const tasks = [
      usersRef.child(requesterUid).child("friends").once("value").then(snap => {
        requesterFriends = snap.val();
      }),
      usersRef.child(invitedUid).child("invites").once("value").then(snap => {
        invitedRequests = snap.val();
      })
  ];

  await Promise.all(tasks);

 // if requesterEmail in invitedRequests OR invitedEmail in requesterFirends
 // pass

  if (objectHasValue(requesterFriends, invitedEmail) 
      || objectHasValue(invitedRequests, requesterEmail)) {
    console.log("this should run!!");
    
    return {success: false};
  }
  console.log("Llega al final");
  await usersRef
    .child(invitedUid)
    .child("invites")
    .push(requesterEmail);

  return {success: true}

});

async function getUidFromEmail(email) {
  const response = await admin.database().ref(`/emailUid/${emailToId(email)}`).once("value").then(snap => {
    return snap.val();   
  });
  return response;
}

async function getUserEmail(userUid) {
  const response = await admin.database().ref(`/users/${userUid}/email`).once("value").then(snap => {
    return snap.val();   
  });
  return response;
}

exports.acceptInvite = functions.https.onCall(async (data, context) => {
  // const uid = context.auth.uid;
  // const name = context.auth.token.name || null;
  // const picture = context.auth.token.picture || null;
  const accepterUid = strClean(data.accepterUid) || context.auth.token.uid || null;
  const accepterEmail = await strClean(getUserEmail(accepterUid));
  console.log("Accepter email:", accepterEmail);

  const requesterEmail = data.requesterEmail;
  console.log("Inviter email:", requesterEmail);
  const requesterUid = await getUidFromEmail(requesterEmail);
  console.log("Inviter uid:", requesterUid);

  await admin
    .database()
    .ref(`/users/${accepterUid}/friends`)
    .push(requesterEmail)
    .then(() => {
      return admin
        .database()
        .ref(`/users/${requesterUid}/friends`)
        .push(accepterEmail);
    });

    return {success: true}
});

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

function getAllKeysByValue(object, value) {
  return Object.keys(object).filter(key => object[key] === value);
}

exports.removeInvitesOnFriendCreation = functions.database
  .ref("/users/{userId}/friends/{friendId}")
  .onCreate(async (snapshot, context) => {
    const userId = context.params.userId;
    var friendId = "";
    await snapshot.ref.once("value").then(snap => {
      friendId = snap.val();
    });

    const userInvites = admin.database().ref(`/users/${userId}/invites`);

    const removePromises = [];
    await userInvites.once("value").then(snap => {
      const invites = snap.val();
      console.log(invites);
      console.log(idToEmail(friendId));

      const friendInvites = getAllKeysByValue(invites, idToEmail(friendId));
      console.log(friendInvites);

      friendInvites.map(inviteId => {
        removePromises.push(userInvites.child(inviteId).remove());
      });
    });

    return Promise.all(removePromises);
  });

function createStatisticsField(userId){
  return admin
  .database()
  .ref("/statistics/" + userId).set({
    attack_cards_played: 0,
    condition_cards_played: 0,
    healing_cards_played: 0,
    games_lost: 0,
    games_played: 0,
    games_played_with_earth: 0,
    games_played_with_wind: 0,
    games_played_with_fire: 0,
    games_played_with_water: 0,
    games_won: 0
  });
}

exports.createStatsOnUserCreation = functions.database
.ref("/users/{userId}")
.onCreate(async (snapshot, context) => {
  const userId = context.params.userId;
  return createStatisticsField(userId);
});

function increaseStat(userId, stat){
  return admin
  .database()
  .ref("/statistics/"+userId+"/"+stat).transaction(function(currentStat) {
    return (currentStat || 0) + 1;
  });
} 

function getWizType(gameId, userId){
  return admin
  .database()
  .ref("games/" + gameId + "/players/" + userId + "/wiz_type")
  .once("value").then(snap => {
    return snap.val();
  });
}

exports.updateStatsOnGameStart = functions.database
.ref("games/{gameId}/players/{playerId}")
.onCreate(async (snapshot, context) => {
  var playerId = context.params.playerId;
  var gameId = context.params.gameId;
  var stat = "games_played";
  var wiz_type = "";
  await snapshot.ref.once("value").then( snap => {
    wiz_type = snap.val();
  });
  return Promise.all([increaseStat(playerId, stat), increaseStat(playerId, "games_played_with_" + wiz_type)]);
});

exports.watchTurnCompletion = functions.database
.ref("/games/{gameId}/starts/{startId}/")
.onUpdate(async (change, context) => {
    const gameId = context.params.gameId;
    const startId = context.params.startId;
    // Check if new value is != 1
    const newValue = change.after.child('scroll').val();
    if (newValue === 0) {
        return null;
    }
    const turnRef = admin.database().ref(`/games/${gameId}/turn/`)
    // Check the rest of the starts
    var starts;
    var startsStates = [];
    const startsRef = admin.database().ref(`/games/${gameId}/starts/`)
    await startsRef.once("value").then(snap => {
        starts = snap.val();
    });
    if (Object.keys(starts).length < playersCount) {
        return ;
    }
    for (start in starts) {
        startsStates.push(starts[start]);
    }
    var turnEnded = 1;
    await turnRef.parent.child("turnEnded").once("value").then(snap => {
      turnEnded = snap.val();
    });    
    if (startsStates.every(value => value === 0) && turnEnded === 0) {
        const tasks = [
            turnRef.parent.child("target1").set(randomIntBetween(0, 4)),
            turnRef.parent.child("target2").set(randomIntBetween(0, 4)),
            turnRef.parent.child("target3").set(randomIntBetween(0, 4)),
            drawScrolls(turnRef.parent),
            turnRef.parent.child("turnEnded").set(1)
        ];
        return Promise.all(tasks);
    }
    return ;

    // set turnEnded = 1
});

function randomIntBetween(low, high) {
    return Math.floor(Math.random() * (high+1)) + low
}

exports.inviteFriendsToNewGame = functions.https.onCall(async (data, context) => {
    const invitedUsers = [data.user1, data.user2, data.user3];
    const creatorUid = strClean(data.creator);
    console.log(invitedUsers);

    const invitedUsersUids = [];
    for (const invitedEmail of invitedUsers) {
      const invitedUid = await getUidFromEmail(strClean(invitedEmail));
      invitedUsersUids.push(strClean(invitedUid));
    }

    const gameId = Date.now() * 100 + randomIntBetween(100, 999);

    const usersRef = admin.database().ref(`/users`);
    const gameInviteUsersRef = admin.database().ref(`/game_invites/${gameId}/users`);

    const tasks = []
    invitedUsersUids.forEach(userUid => {
        tasks.push(usersRef.child(userUid).child('game_invites').push(gameId));
        tasks.push(gameInviteUsersRef.child(userUid).set(0));
    });
    // Creator auto accepts invitation to its own game
    tasks.push(gameInviteUsersRef.child(creatorUid).set(1));

    Promise.all(tasks).then(() => {
        return {success: true, gameId};
    }).catch(() => {
        return {success: false};
    });
});
     
exports.getGameInvites = functions.https.onCall((data, context) => {
    const userUid = strClean(data.uid) || context.auth.token.uid || null;
  
    return admin
      .database()
      .ref(`/users/${userUid}/game_invites`)
      .once("value").then(snap => {
        return snap.val();
      });
  
});

exports.acceptGameInvite = functions.https.onCall(async (data, context) => {
    const userUid = data.uid || context.auth.token.uid || null;
    const gameId = data.gameId;

    const gameInviteUsersRef = admin.database().ref(`/game_invites/${gameId}/users`);
    const userGameInvitesRef = admin.database().ref(`/users/${userUid}/game_invites`);

    const tasks = [
        gameInviteUsersRef.child(userUid).set(1),
        userGameInvitesRef.child(gameId).remove()
    ];

    await Promise.all(tasks).then(() => {
        return { success: true }
    });
});

exports.getDisplayName = functions.https.onCall(async (data, context) => {
    const userEmail = data.email || context.auth.token.email || null;
    const userRef = admin.database().ref(`/users/${emailToId(userEmail)}`);

    console.log("faulty mail: ", userEmail);
    
    var displayName = "NEWDidNotFindDisplayName@mail.com"
    await userRef.child("DisplayName").once("value").then(snap => {
        displayName = snap.val();
        console.log("Display name found: ", displayName);
        
        return displayName;
    }).catch(() => {
        console.log("CATCH Display name found: ", displayName);
        return displayName;
    });

    return displayName;
});

function shuffleArray(array) {

    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

exports.initGame = functions.database
.ref("/game_invites/{gameId}/users/{userId}/")
.onUpdate(async (change, context) => {
    const gameId = context.params.gameId;
    const userId = context.params.userId;
    var players = {};
    // Check if user accepted game invite (=== new value is == 1)
    const newValue = change.after.val();
    if (newValue != 1) {
        return null;
    }
    // Check the rest of the invites state
    var usersInviteStates;
    var inviteStates = [];
    const usersInviteStatesRef = admin.database().ref(`/game_invites/${gameId}/users/`)
    await usersInviteStatesRef.once("value").then(snap => {
        usersInviteStates = snap.val();
    });
    if (Object.keys(usersInviteStatesRef).length < playersCount) {
        return ;
    }

    var magesTypes = ["water", "earth", "wind", "fire"];
    shuffleArray(magesTypes);
    const users = [];
    for (user in usersInviteStates) {
        inviteStates.push(usersInviteStates[user]);
        players[user] = magesTypes.pop();
        users.push(user);
    }

    if (inviteStates.every(value => value == 1)) {
        // Initialize game:
        //      - remove game from /game_invites/
        //      - add gameId to /games
        //      - add gameId in user's active_games
        
        const usersDecks = await getUsersDecks(users);

        const usersRef = admin.database().ref(`/users`); 
        const game = admin.database().ref(`/games/${gameId}`);            
        const tasks = [
            usersInviteStatesRef.parent.remove(),
            game.child("players").set(players),
            game.child("enemy1").set(5),
            game.child("enemy2").set(7),
            game.child("enemy3").set(7),
            game.child("level").set(1),
            game.child("levelUp").set(0),
            game.child("mageEarth").set(10),
            game.child("mageFire").set(10),
            game.child("mageWater").set(10),
            game.child("mageWind").set(10),
            game.child("turnEnded").set(0),
            game.child("target1").set(1),
            game.child("target2").set(2),
            game.child("target3").set(3),
            game.child("starts").set(
              { start_earth: 1,
                start_fire: 1,
                start_water: 1,
                start_wind: 1, }
            )
        ];
        users.forEach(user => {
            tasks.push(
                usersRef.child(emailToId(user))
                        .child("active_games").push(gameId)
                );
        });
        usersDecks.forEach(userDeck => {
          tasks.push(
            game.child("decks").child(players[userDeck["user"]]).set(userDeck["deck"])
          );
        })
        return Promise.all(tasks);
    }

    return ;

    // set turnEnded = 1
});

exports.getActiveGames = functions.https.onCall(async (data, context) => {
    const userUid = data.uid;

    var response = {};
    await admin
      .database()
      .ref(`/users/${userUid}/active_games`)
      .once("value").then(snap => {
        response = snap.val();
      });
    return response;
});

exports.watchLevelUp = functions.database
  .ref("/games/{gameId}/levelUp")
  .onUpdate(async (change, context) => {
    const gameId = context.params.gameId;
    const newValue = change.after.val();
    if (newValue < 1) {
      return null;
    }
    const game = admin.database().ref(`/games/${gameId}`);
    const tasks = [
      game.child("starts").set(
        { start_earth: 1,
          start_fire: 1,
          start_water: 1,
          start_wind: 1, }
      ),
      game.child("turnEnded").set(0)
    ];

    await Promise.all(tasks);
    return {success: true};
  });

exports.levelUpIsOne = functions.database
  .ref("/games/{gameId}/levelUp")
  .onUpdate(async (change, context) => {
    const gameId = context.params.gameId;
    const newValue = change.after.val();
    if (newValue === 1) {
      const game = admin.database().ref(`/games/${gameId}`);
      const tasks = [
        game.child("level").transaction((current) => {
          return (current || 0) + 1;
        }),
        game.child("turnEnded").set(0)
      ];
  
      await Promise.all(tasks);
      return {success: true};
    }
    return null;
});

function getScrollType(scrollId){
  return admin
  .database()
  .ref("scrolls/" + scrollId + "/type")
  .once("value").then( snap => {
    return snap.val();
  });
}

function effectIdToUserId(effectId){
  return effectId.split("_")[1];
}

function getPlayerIdByDeckId(gameId, deckId){
  return admin.database()
  .ref(`games/${gameId}/players`)
  .once("value").then( snap => {
    console.log(snap.val());
    for (const playerId in snap.val()) {
      if (snap.val().hasOwnProperty(playerId)) {
        if (snap.val()[playerId] == deckId) {
          return playerId;
        }
      }
    }
  });
}

exports.updateStatsOnScrollPlayed = functions.database
  .ref("games/{gameId}/decks/{deckId}/{scrollId}/used")
  .onUpdate(async (change, context) => {
    const deckId = context.params.deckId;
    const scrollId = context.params.scrollId;
    const gameId = context.params.gameId;
    var scrollType = await getScrollType(scrollId);
    var playerId = await getPlayerIdByDeckId(gameId, deckId);
    var scrollCount = change.after.val();
    if (scrollCount > '0'){
      return increaseStat(playerId, scrollType + "_cards_played");
    }
  });
  
  exports.getStatistics = functions.https.onCall((data, context) => {
    const userUid = strClean(data.uid) || context.auth.token.uid || null;

    return admin
      .database()
      .ref(`statistics/${userUid}`)
      .once("value").then(snap => {
        return snap.val()
      });
  });

function getGamePlayers(gameId){
  return admin
  .database()
  .ref("games/" + gameId + "/players/{playerId}")
  .on('value', function(snapshot) {
    console.log(playerId);
    return playerId;
  });
}

function notifyPlayers(gameId){
  const messaging = admin.messaging();
  var players = getGamePlayers(gameId);
  console.log(players);
  messaging.requestPermission().then(function() {
   // String token = FirebaseInstanceId.getInstance().getToken();
   // retutn messaging.getToken();
  });
  
}

exports.notifyNewTurn = functions.database
  .ref("games/{gameId}/turnEnded")
  .onUpdate(async (change, context) => {
    var turnEnded = "";
    const gameId = context.params.gameId;
    await change.ref.once("value").then( snap => {
      turnEnded = snap.val();
    });
    if(turnEnded == 1){
      notifyPlayers(gameId);
    }
  });

// Set used scroll as used in player's deck
// onUpdate od onCreate??
exports.setScrollAsUsed = functions.database
  .ref("/games/{gameId}/turn/{effect}")
  .onUpdate(async (change, context) => {
    const effect = context.params.effect;
    const gameId = context.params.gameId;
    const userId = strClean(effectIdToUserId(effect));
    console.log("Effect of user: ", userId);
    const userMage = await getUserMageInGame(userId, gameId);
    console.log("Change in mage: ", userMage);    
    
    const usedScrollId = change.after.child('scroll').val();
    console.log("Used scroll: ", usedScrollId); 
    const userDeckRef = admin.database().ref(`/games/${gameId}/decks/${userMage}/`);

    const userDeckScrolls = await userDeckRef.once("value").then(snap => {
      return snap.val();
    });
    console.log("Mage scrolls: ", userDeckScrolls);
    
    // search for first scroll in user's deck that maches userScrollId and mark it as used
    for (const scroll in userDeckScrolls) {
      if (userDeckScrolls.hasOwnProperty(scroll)) {
        const aScroll = userDeckScrolls[scroll];
        if (aScroll["id"] == usedScrollId) {
          userDeckScrolls[scroll]["used"] = 1;
          break;
        }
      }
    }
    // save changesuserMage
    await userDeckRef.set(userDeckScrolls);
    return ;

  });

async function getUserMageInGame(userId, gameId) {
  const gameRef = admin.database().ref(`/games/${gameId}/`);

  // var userMage = null;
  const userMage = await gameRef.child("players").child(strClean(userId))
    .once("value").then(snap => {
      return snap.val();
    });
  // console.log(players);
  // userMage = players[userId];
  console.log("userMage: ", userMage);
  return userMage;
}

async function drawScrolls(gameRef) {
  const decksRef = gameRef.child("decks");
  // for each mage, draw 3 unused scrolls from their deck
  // if not enough scrolls, set id as -1
  const mages = ["earth", "fire", "water", "wind"];
  for (const mage of mages) {
    console.log("Mage: ", mage,);
    const mageScrolls = await decksRef.child(mage).once("value").then(snap => {
      return snap.val();
    });    
    console.log(mageScrolls);    
    const unusedScrolls = getUnusedScrollsIds(mageScrolls);
    console.log("Unused: ", unusedScrolls);
    var scrollsIdsToDraw = unusedScrolls.map(scroll => scroll.id);
    scrollsIdsToDraw = [...scrollsIdsToDraw, -1,-1,-1];

    const hand = {
      scroll0: scrollsIdsToDraw[0],
      scroll1: scrollsIdsToDraw[1],
      scroll2: scrollsIdsToDraw[2]
    }
    await gameRef.child(`hand_${mage}`).set(hand);
  }
  return ;
}

function getUnusedScrollsIds(scrolls) {
  const scrollsKeys = Object.keys(scrolls);
  const unusedScrolls = [];
  if (scrollsKeys.length > 0) {
    scrollsKeys.forEach(scrollKey => {
      if (scrolls[scrollKey].used == 0) {
        unusedScrolls.push(scrollKey);
      }
    });
  }
  return unusedScrolls
}

exports.initNewUser = functions.auth.user().onCreate(user => {
  const email = strClean(user.email);
  const uid = strClean(user.uid);
  const displayName = strClean(user.displayName)|| strClean(email);
  const tasks = [
    admin.database().ref(`/users/${uid}`).set({email, displayName, gold:0}),
    admin.database().ref(`/emailUid/${emailToId(email)}`).set(uid),
    admin.database().ref(`/decks/${uid}`).set(
      {
        "defaultScroll0" : {
          "id" : 4,
          "inDeck" : 1
        },
        "defaultScroll1" : {
          "id" : 4,
          "inDeck" : 1
        },
        "defaultScroll2" : {
          "id" : 4,
          "inDeck" : 1
        },
        "defaultScroll3" : {
          "id" : 4,
          "inDeck" : 1
        },
        "defaultScroll4" : {
          "id" : 4,
          "inDeck" : 1
        },
        "defaultScroll5" : {
          "id" : 4,
          "inDeck" : 1
        }
      }
    ),
  ];
  return Promise.all(tasks);
});

function strClean(str) {
  if (str && typeof str === 'string') {
    return str.replace(/[\u200B-\u200D\uFEFF]/g, '');
  }
  return str;
}

async function getUsersDecks(users) {
  const decksRef = admin.database().ref(`/decks`);
  const decks = [];
  for (const user of users) {
    var deck = await decksRef.child(user).once("value").then(snap => {
      return snap.val();
    });
    try {
      deck = Object.values(deck);
      // Only get scrolls inDeck
      deck = deck.filter(scroll => scroll["inDeck"] == 1);
      deck = deck.map(scroll => ({id: scroll["id"], used: 0}))
      decks.push({ user, deck });
    } catch (error) {
      console.log(error);
    }
  }
  return decks;
}