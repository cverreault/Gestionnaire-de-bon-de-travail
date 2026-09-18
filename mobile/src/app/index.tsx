import { Redirect } from 'expo-router';

/** Entry point: the root layout's gate decides where to go. */
export default function Index() {
  return <Redirect href="/(app)" />;
}
