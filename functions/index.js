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

exports.getStatistics = functions.https.onCall((data, context) => {
  const userEmail = data.email || context.auth.token.email || null;

  return admin
    .database()
    .ref("/statistics/" + emailToId(userEmail))
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

exports.watchGameCompletion = functions.database
.ref("/games/{gameId}/turn/{effectId}/")
.onUpdate(async (change, context) => {
    const gameId = context.params.gameId;
    // Check if new value is != -1
    const newValue = change.after.child('scroll').val();
    if (newValue === -1) {
        return null;
    }
    // Check the rest of the scrolls
    var effects;
    var scrolls = [];
    const turnRef = admin.database().ref(`/games/${gameId}/turn/`)
    await turnRef.once("value").then(snap => {
        effects = snap.val();
    });
    if (Object.keys(effects).length < 1) {
        return ;
    }
    for (effect in effects) {
        scrolls.push(effects[effect].scroll);
    }
    if (scrolls.every(value => value > -1)) {
        const tasks = [
            turnRef.parent.child("target1").set(randomIntBetween(0, 4)),
            turnRef.parent.child("target2").set(randomIntBetween(0, 4)),
            turnRef.parent.child("target3").set(randomIntBetween(0, 4)),
            turnRef.parent.child("turnEnded").set(1)
        ];
        return Promise.all(tasks);
    }

    console.log(scrolls);
    return ;

    // set turnEnded = 1
});