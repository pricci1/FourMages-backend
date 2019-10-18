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

exports.getInvites = functions.https.onCall((data, context) => {
    const userEmail = data.email;
    console.log(userEmail);
  
    return admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/invites`)
      .once("value").then(snap => {
        const resp =snap.val();
        console.log(resp);
          
        return resp;
      });
  
  });

exports.getFriends = functions.https.onCall((data, context) => {
    const userEmail = data.email || context.auth.token.email || null;
  
    return admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/friends`)
      .once("value").then(snap => {
        return snap.val();
      });
  
  });

exports.sendInvite = functions.https.onCall((data, context) => {
  const requesterEmail = data.requesterEmail || context.auth.token.email || null;
  const invitedEmail = data.invitedEmail;

  return admin
    .database()
    .ref(`/users/${emailToId(invitedEmail)}/invites`)
    .push(requesterEmail)

});

exports.acceptInvite = functions.https.onCall((data, context) => {
  // const uid = context.auth.uid;
  // const name = context.auth.token.name || null;
  // const picture = context.auth.token.picture || null;
  const email = data.accepterEmail || context.auth.token.email || null;
  console.log("Accepter email:", email);

  const requesterEmail = data.requesterEmail;
  console.log("Inviter email:", requesterEmail);

  return admin
    .database()
    .ref(`/users/${emailToId(email)}/friends`)
    .push(requesterEmail)
    .then(() => {
      return admin
        .database()
        .ref(`/users/${emailToId(requesterEmail)}/friends`)
        .push(email);
    });
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
    if (startsStates.every(value => value === 0)) {
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
