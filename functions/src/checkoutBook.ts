import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import Checkout from '@common/types/Checkout';
import User, { checkoutInfo } from '@common/types/User';

interface checkoutBookData {
  user: string;
  books: checkoutBookDataBooks[];
}

interface checkoutBookDataBooks {
  book: string;
  copy: string;
  condition: 1 | 2 | 3 | 4 | 5;
}

const checkoutBook = functions
  .region('us-west2')
  .https.onCall(async (data: checkoutBookData, context) => {
    // App Check Verification
    if (!context.app || process.env.FUNCTIONS_EMULATOR) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The function must be called from an App Check verified app.'
      );
    }

    // Auth Verification
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    if (typeof context.auth.token.role === 'undefined') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'The caller must already have a set role.'
      );
    }

    if (!context.auth.token.permissions.CHECK_OUT) {
      throw new functions.https.HttpsError(
        'permission-denied',
        "The user calling the function must have the 'CHECK_OUT' permission."
      );
    }

    if (typeof data.user !== 'string' || typeof data.books !== 'object') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with an email, first name, last name, role, and permissions'
      );
    }

    await admin
      .auth()
      .getUser(data.user)
      .catch(() => {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Unknown User'
        );
      });

    const userDocData = await (
      await admin.firestore().collection('users').doc(data.user).get()
    ).data();

    const defaultUserCheckoutInfo: checkoutInfo = {
      activeCheckouts: [],
      maxCheckouts: 3,
      maxRenews: 2,
    };
    const userCheckoutInfo: checkoutInfo =
      userDocData?.checkoutInfo ?? defaultUserCheckoutInfo;

    data.books.forEach((book) => {
      if (!Array.isArray(userCheckoutInfo.activeCheckouts))
        throw new functions.https.HttpsError(
          'internal',
          'userCheckoutInfo.activeCheckouts was not an array'
        );
      if (
        (userCheckoutInfo?.activeCheckouts?.length ?? 0) >=
        (userCheckoutInfo?.maxCheckouts ?? 3)
      ) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Too many books'
        );
      }

      const checkout: Checkout = {
        book: book.book,
        copy: book.copy,
        user: data.user,
        checkedOutBy: context.auth?.uid,
        timeOut: admin.firestore.FieldValue.serverTimestamp(),
        timeIn: null,
        conditionOut: book.condition,
        conditionIn: null,
      };

      const newCheckout = admin.firestore().collection('checkouts').doc();

      const user: User = {
        checkoutInfo: {
          activeCheckouts: admin.firestore.FieldValue.arrayUnion(
            newCheckout.id
          ),
        },
      };

      const batch = admin.firestore().batch();

      batch.create(newCheckout, checkout);
      batch.update(admin.firestore().collection('users').doc(data.user), user);
    });
  });

export default checkoutBook;