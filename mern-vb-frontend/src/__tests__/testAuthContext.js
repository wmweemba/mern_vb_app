import { createContext } from 'react';

// Shared between AdminModeSwitch.test.js and its jest.mock('../store/auth') factory.
export const MockAuthContext = createContext();
