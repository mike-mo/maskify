chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  'use strict';
  const fakeEmails = {};

  alert("Show all properties of request: " + JSON.stringify(request));

  function replaceWord() {
    // Find all occurrences of "no" in the body and replace them with "yes"
    $("body").each(function () {
      var content = $(this).html();
      var newContent = content.replace(/NO/g, "YES");
      $(this).html(newContent);
    });
  }
  replaceWord();

  function getFakeEmail(baseEmail) {
    const domain = 'example.com'; // Choose your fake domain
    if (!fakeEmails[baseEmail]) {
        const randomPart = Math.random().toString(36).substring(2, 10); // Generate a random string
        fakeEmails[baseEmail] = `fake_${randomPart}@${domain}`;
    }
    return fakeEmails[baseEmail];
  }

   function replaceEmailAddresses() {
       const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
       const elementsWithText = document.querySelectorAll('body, body *:not(script):not(noscript)');

       $("body").each(function () {
        // Write the current object out to the console
        console.log($(this));
        const matches = $(this).html().match(emailRegex);
        if (matches) {
          matches.forEach(match => {
            const fakeAddress = generateFakeEmail(match);
            element.textContent = element.textContent.replace(match, fakeAddress);
          });
        }
        $(this).html(newContent);
      });
   }

   //replaceEmailAddresses();

  sendResponse({ fromcontent: "This message is from content.js" });
});


// $(document).ready(function () {
//   // Find all occurrences of "no" in the body and replace them with "yes"
//   $("body").each(function () {
//     var content = $(this).html();
//     var newContent = content.replace(/no/g, "yes");
//     $(this).html(newContent);
//   });
// });




// (function() {
//    'use strict';

//    const fakeEmails = {};

//    function generateFakeEmail(baseEmail) {
//        const domain = 'fake-email-domain.com'; // Choose your fake domain
//        if (!fakeEmails[baseEmail]) {
//            const randomPart = Math.random().toString(36).substring(2, 10); // Generate a random string
//            fakeEmails[baseEmail] = `fake_${randomPart}@${domain}`;
//        }
//        return fakeEmails[baseEmail];
//    }

//    function replaceEmailAddresses() {
//        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

//        const elementsWithText = document.querySelectorAll('body, body *:not(script):not(noscript)');

//        elementsWithText.forEach(element => {
//            const matches = element.textContent.match(emailRegex);
//            if (matches) {
//                matches.forEach(match => {
//                    const fakeAddress = generateFakeEmail(match);
//                    element.textContent = element.textContent.replace(match, fakeAddress);
//                });
//            }
//        });
//    }

//    replaceEmailAddresses();
// })();
