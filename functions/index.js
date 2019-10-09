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
    const userEmail = context.auth.token.email || null;
  
    return admin
      .database()
      .ref(`/users/${emailToId(userEmail)}/friends`)
      .once("value").then(snap => {
        return snap.val();
      });
  
  });

exports.sendInvite = functions.https.onCall((data, context) => {
  const inviterEmail = context.auth.token.email || null;
  const invitedEmail = data.invitedEmail;

  return admin
    .database()
    .ref(`/users/${emailToId(invitedEmail)}/invites`)
    .push(inviterEmail)

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
