import React, { useState, useRef } from 'react';
import {
  Stepper,
  Step,
  StepLabel,
  TextField,
  Table,
  TableCell,
  TableRow,
  TableHead,
  TableBody,
  Button,
  Paper,
  TableContainer,
} from '@material-ui/core';
import * as yup from 'yup';
import { Formik, Form } from 'formik';
import * as firebase from 'firebase/app';
import 'firebase/firestore';
import { useFirebaseApp } from 'reactfire';
import User from '@common/types/User';
import Copy, {
  status as statusType,
  condition as conditionType,
} from '@common/types/Copy';
import checkoutBookData, {
  checkoutBookDataBooks,
} from '@common/functions/checkoutBook';

interface checkoutData {
  user: User | null;
  books: checkoutDataBook[];
}

interface checkoutDataBook {
  data: Copy;
  dueDate: firebase.default.firestore.Timestamp;
  id: string;
  parent: any;
  parentData: any;
}

function determineStatus(status: statusType) {
  switch (status) {
    case 0:
      return 'On Shelf';
    case 1:
      return 'In Storage';
    case 2:
      return 'Checked Out';
    case 3:
      return 'Missing';
    case 4:
      return 'Not Tracked';
    default:
      return 'Unknown Status';
  }
}

function determineCondition(condition: conditionType) {
  switch (condition) {
    case 1:
      return 'New';
    case 2:
      return 'Good';
    case 3:
      return 'Fair';
    case 4:
      return 'Poor';
    case 5:
      return 'Bad';
    default:
      return 'Unknown Condition';
  }
}

const EnterUserScheme = yup.object().shape({
  userID: yup.string().required("You need to enter the User's ID"),
});

const EnterUser = ({
  setActiveState,
  checkoutData,
  setCheckoutData,
}: {
  setActiveState: React.Dispatch<React.SetStateAction<number>>;
  checkoutData: checkoutData;
  setCheckoutData: React.Dispatch<React.SetStateAction<checkoutData>>;
}) => {
  const firebaseApp = useFirebaseApp();
  return (
    <div>
      <Formik
        initialValues={{
          userID: '',
        }}
        validationSchema={EnterUserScheme}
        onSubmit={async (values, actions) => {
          actions.setSubmitting(true);
          const userDoc: firebase.default.firestore.DocumentSnapshot<User> =
            await firebaseApp
              .firestore()
              .collection('users')
              .doc(values.userID)
              .get();

          if (!userDoc.exists) {
            actions.setFieldError('userID', "This User doesn't exist");
            return actions.setSubmitting(false);
          }

          const user = userDoc.data();

          if (!user) {
            actions.setFieldError('userID', "This User doesn't exist");
            return actions.setSubmitting(false);
          }

          // Check if user is disabled
          if (user.userInfo?.disabled ?? true) {
            actions.setFieldError('userID', 'This User is disabled');
            return actions.setSubmitting(false);
          }

          // TODO: Implement logic to check if user can checkout books.
          setCheckoutData({ books: checkoutData.books, user });
          return setActiveState(1);
        }}
      >
        {({ values, errors, isSubmitting, handleChange, submitCount }) => (
          <Form noValidate>
            <TextField
              id="userID"
              type="text"
              label="User ID"
              error={!!errors.userID && submitCount > 0}
              helperText={submitCount > 0 ? errors.userID : ''}
              value={values.userID}
              onChange={handleChange}
              disabled={isSubmitting}
              required
              autoFocus
            />
          </Form>
        )}
      </Formik>
    </div>
  );
};

const ScanBooksScheme = yup.object().shape({
  book: yup.string().required("You need to enter the User's ID"),
});

const ScanBooks = ({
  setActiveState,
  checkoutData,
  setCheckoutData,
}: {
  setActiveState: React.Dispatch<React.SetStateAction<number>>;
  checkoutData: checkoutData;
  setCheckoutData: React.Dispatch<React.SetStateAction<checkoutData>>;
}) => {
  const bookInput: any = useRef();
  const firebaseApp = useFirebaseApp();
  return (
    <div>
      <Formik
        initialValues={{
          book: '',
        }}
        validationSchema={ScanBooksScheme}
        onSubmit={async (values, actions) => {
          const bookResults = await firebaseApp
            .firestore()
            .collectionGroup('copies')
            .where('barcode', '==', values.book)
            .get();

          if (bookResults.empty) {
            actions.setFieldError('book', "This book doesn't exist");
            actions.setSubmitting(false);
            return bookInput?.current?.focus() || null;
          }
          if (bookResults.size !== 1) {
            actions.setFieldError(
              'book',
              'I found more than one book with this barcode.'
            );
            actions.setSubmitting(false);
            return bookInput?.current?.focus() || null;
          }

          const { id, ref } = bookResults.docs[0];
          const data = bookResults.docs[0].data() as Copy;

          if (
            checkoutData.books.some((book) => book.data.barcode === values.book)
          ) {
            actions.setFieldError(
              'book',
              'This book has already been scanned.'
            );
            actions.setSubmitting(false);
            return bookInput?.current?.focus() || null;
          }

          if (data.status !== 0 && data.status !== 1) {
            actions.setFieldError(
              'book',
              'This book is not marked as available.'
            );
            actions.setSubmitting(false);
            return bookInput?.current?.focus() || null;
          }

          const { parent } = ref.parent;
          if (parent === null) {
            actions.setFieldError(
              'book',
              'This copy does not belong to any book (Internal Error)'
            );
            actions.setSubmitting(false);
            return bookInput?.current?.focus() || null;
          }

          const parentData = await (await parent.get()).data();

          data.condition = data.condition ?? 3;

          setCheckoutData({
            books: [
              ...checkoutData.books,
              {
                data,
                id,
                parent: parent.id,
                parentData,
                dueDate: firebase.default.firestore.Timestamp.fromMillis(
                  Date.now()
                ),
              },
            ],
            user: checkoutData.user,
          });
          actions.setSubmitting(false);
          actions.resetForm();
          return bookInput?.current?.focus() || null;
        }}
      >
        {({ values, errors, isSubmitting, handleChange, submitCount }) => (
          <Form noValidate>
            <TextField
              inputRef={bookInput}
              id="book"
              type="text"
              label="Barcode"
              error={!!errors.book && submitCount > 0}
              helperText={submitCount > 0 ? errors.book : ''}
              value={values.book}
              onChange={handleChange}
              disabled={isSubmitting}
              required
              autoFocus
            />
          </Form>
        )}
      </Formik>
      <TableContainer component={Paper} style={{ margin: 10, padding: 25 }}>
        <Table aria-label="copy table">
          <TableHead>
            <TableRow>
              <TableCell>Barcode</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Copy Condition</TableCell>
              <TableCell>Copy Status</TableCell>
              <TableCell>Copy Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checkoutData.books.map(
              ({
                data: { barcode, condition, notes, status },
                id,
                parentData,
              }) => (
                <TableRow key={id}>
                  <TableCell component="th" scope="row">
                    {barcode}
                  </TableCell>
                  <TableCell>
                    {parentData?.volumeInfo?.title || ''}{' '}
                    {parentData?.volumeInfo?.subtitle || ''}
                  </TableCell>
                  <TableCell>
                    {condition ? determineCondition(condition) : ''}
                  </TableCell>
                  <TableCell>{status ? determineStatus(status) : ''}</TableCell>
                  <TableCell>{notes === '' ? <i>None</i> : notes}</TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Button
        variant="contained"
        color="primary"
        size="large"
        style={{ marginTop: 25 }}
        onClick={() => setActiveState(2)}
      >
        Continue
      </Button>
    </div>
  );
};

const Submit = ({
  // setActiveState,
  checkoutData,
}: // setCheckoutData,
{
  // setActiveState: React.Dispatch<React.SetStateAction<number>>;
  checkoutData: checkoutData;
  // setCheckoutData: React.Dispatch<React.SetStateAction<checkoutData>>;
}) => {
  const functions = useFirebaseApp();

  async function submit() {
    console.log('1');
    const books: checkoutBookDataBooks[] = [];
    checkoutData.books.forEach((book) => {
      books.push({
        bookID: book.parent,
        condition: book.data.condition ?? 3,
        copyID: book.id,
        dueDate: book.dueDate,
      });
    });
    console.log('2');

    if (!checkoutData.user?.userInfo?.uid) {
      throw new Error('This user does not have a UID');
    }
    console.log('3');

    const checkoutBookFunctionData: checkoutBookData = {
      books,
      userID: checkoutData.user?.userInfo?.uid,
    };
    console.log(checkoutBookFunctionData);

    await functions
      .functions('us-west2')
      .httpsCallable('addNewUser')(checkoutBookFunctionData)
      .then((res) => {
        console.log(res);
      })
      .catch((err) => {
        console.error(err);
      });

    // await functions
    //   .httpsCallable('checkoutBook')(checkoutBookFunctionData)
    //   .then((res) => {
    //     console.log('5');

    //     console.log(res);
    //     // setCheckoutData({ user: null, books: [] });
    //     // setActiveState(0);
    //   })
    //   .catch((err) => console.warn(err));
  }
  return <Button onClick={() => submit()}>Submit</Button>;
};

const CheckOut = () => {
  const [activeState, setActiveState] = useState(0);
  const [checkoutData, setCheckoutData] = useState<checkoutData>({
    user: null,
    books: [],
  });
  return (
    <div>
      <div className="text-center lead m-5">
        <h1>Check Out</h1>
      </div>
      <Stepper style={{ marginInline: 100 }}>
        <Step key={0} active={activeState === 0} completed={activeState > 0}>
          <StepLabel>Enter User</StepLabel>
        </Step>
        <Step key={1} active={activeState === 1} completed={activeState > 1}>
          <StepLabel>Scan Books</StepLabel>
        </Step>
        <Step key={2} active={activeState === 2} completed={activeState > 2}>
          <StepLabel>Finalize Checkout</StepLabel>
        </Step>
      </Stepper>
      <div className="text-center" style={{ marginTop: '1rem' }}>
        {activeState === 0 && (
          <EnterUser
            setActiveState={setActiveState}
            checkoutData={checkoutData}
            setCheckoutData={setCheckoutData}
          />
        )}
        {activeState === 1 && (
          <ScanBooks
            setActiveState={setActiveState}
            checkoutData={checkoutData}
            setCheckoutData={setCheckoutData}
          />
        )}
        {activeState === 2 && (
          <Submit
            // setActiveState={setActiveState}
            checkoutData={checkoutData}
            // setCheckoutData={setCheckoutData}
          />
        )}
      </div>
    </div>
  );
};

export default CheckOut;
