(function() {
   'use strict';

   const fakeEmails = {};

   function generateFakeEmail(baseEmail) {
       const domain = 'fake-email-domain.com'; // Choose your fake domain
       if (!fakeEmails[baseEmail]) {
           const randomPart = Math.random().toString(36).substring(2, 10); // Generate a random string
           fakeEmails[baseEmail] = `fake_${randomPart}@${domain}`;
       }
       return fakeEmails[baseEmail];
   }

   function replaceEmailAddresses() {
       const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

       const elementsWithText = document.querySelectorAll('body, body *:not(script):not(noscript)');

       elementsWithText.forEach(element => {
           const matches = element.textContent.match(emailRegex);
           if (matches) {
               matches.forEach(match => {
                   const fakeAddress = generateFakeEmail(match);
                   element.textContent = element.textContent.replace(match, fakeAddress);
               });
           }
       });
   }

   replaceEmailAddresses();
})();
