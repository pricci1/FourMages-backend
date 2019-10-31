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
    const userEmail = data.email;
    console.log(userEmail);
  
    var invites = [];

    await admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/invites`)
      .once("value").then(snap => {
        invites =snap.val();
      });
  
    return invites
  
  });

exports.getFriends = functions.https.onCall(async (data, context) => {
    const userEmail = data.email || context.auth.token.email || null;
  
    var friends = [];
  
    await admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/friends`)
      .once("value").then(snap => {
        friends = snap.val();
      });
  
    return friends;
  
  });

function objectHasValue(obj, value) {
  if (obj && value) {
    console.log("obj", obj);
    console.log("value", value);
    var found = Object.values(obj).find(val => val.replace(/[^a-zA-Z0-9 -]/i, "") === value);
    return value.replace(/[^a-zA-Z0-9 -]/i, "") === found.replace(/[^a-zA-Z0-9 -]/i, "");
  }
  return false;
}

exports.sendFriendRequest = functions.https.onCall(async (data, context) => {
  const requesterEmail = data.requesterEmail || context.auth.token.email || null;
  const invitedEmail = data.accepterEmail;

  if (requesterEmail === invitedEmail) {
    return {success: false};
  }

  const usersRef = admin.database().ref(`/users`);

  var requesterFirends = {};
  var invitedRequests = {};
  const tasks = [
      usersRef.child(emailToId(requesterEmail)).child("friends").once("value").then(snap => {
        requesterFirends = snap.val();
      }),
      usersRef.child(emailToId(invitedEmail)).child("invites").once("value").then(snap => {
        invitedRequests = snap.val();
      })
  ];

  await Promise.all(tasks);

 // if requesterEmail in invitedRequests OR invitedEmail in requesterFirends
 // pass

  if (objectHasValue(requesterFirends, invitedEmail) 
      || objectHasValue(invitedRequests, requesterEmail)) {
    console.log("this should run!!");
    
    return {success: false};
  }
 
  await usersRef
    .child(emailToId(invitedEmail))
    .child("invites")
    .push(requesterEmail);

  return {success: true}

});

exports.acceptInvite = functions.https.onCall(async (data, context) => {
  // const uid = context.auth.uid;
  // const name = context.auth.token.name || null;
  // const picture = context.auth.token.picture || null;
  const email = data.accepterEmail || context.auth.token.email || null;
  console.log("Accepter email:", email);

  const requesterEmail = data.requesterEmail;
  console.log("Inviter email:", requesterEmail);

  await admin
    .database()
    .ref(`/users/${emailToId(email)}/friends`)
    .push(requesterEmail)
    .then(() => {
      return admin
        .database()
        .ref(`/users/${emailToId(requesterEmail)}/friends`)
        .push(email);
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
  .ref("/statistics/"+userId+"/"+stat).transaction(stat => {
    return stat + 1;
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
  var wiz_type = await getWizType(gameId, playerId)
  return Promise.all([increaseStat(playerId, stat), increaseStat(playerId, "games_played_with_" + wiz_type)])
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

exports.inviteFriendsToNewGame = functions.https.onCall((data, context) => {
    const invitedUsers = [data.user1, data.user2, data.user3];
    const creator = data.creator;
    console.log(invitedUsers);

    const gameId = Date.now() * 100 + randomIntBetween(100, 999);

    const usersRef = admin.database().ref(`/users/`);
    const gameInviteUsersRef = admin.database().ref(`/game_invites/${gameId}/users`);

    const tasks = []
    invitedUsers.forEach(user => {
        tasks.push(usersRef.child(emailToId(user)).child('game_invites').push(gameId));
        tasks.push(gameInviteUsersRef.child(emailToId(user)).set(0));
    });
    // Creator auto accepts invitation to its own game
    tasks.push(gameInviteUsersRef.child(emailToId(creator)).set(1));

    Promise.all(tasks).then(() => {
        return {success: true, gameId};
    }).catch(() => {
        return {success: false};
    });
});
     
exports.getGameInvites = functions.https.onCall((data, context) => {
    const userEmail = data.email || context.auth.token.email || null;
  
    return admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/game_invites`)
      .once("value").then(snap => {
        return snap.val();
      });
  
});

exports.acceptGameInvite = functions.https.onCall(async (data, context) => {
    const userEmail = data.email || context.auth.token.email || null;
    const gameId = data.gameId;

    const gameInviteUsersRef = admin.database().ref(`/game_invites/${gameId}/users`);
    const userRef = admin.database().ref(`/users/${emailToId(userEmail)}/game_invites`);

    const tasks = [
        gameInviteUsersRef.child(emailToId(userEmail)).set(1),
        userRef.child(gameId).remove()
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
        players[emailToId(user)] = magesTypes.pop();
        users.push(user);
    }

    if (inviteStates.every(value => value == 1)) {
        // Initialize game:
        //      - remove game from /game_invites/
        //      - add gameId to /games
        //      - add gameId in user's active_games
        

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
        return Promise.all(tasks);
    }

    return ;

    // set turnEnded = 1
});

exports.getActiveGames = functions.https.onCall(async (data, context) => {
    const userEmail = data.email;

    var response = {};
    await admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/active_games`)
      .once("value").then(snap => {
        response = snap.val();
      });
    return response;
});
