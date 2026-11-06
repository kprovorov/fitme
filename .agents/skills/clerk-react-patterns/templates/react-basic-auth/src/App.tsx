import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";

const App = () => (
  <header>
    <Show when="signed-out">
      <SignInButton />
      <SignUpButton />
    </Show>
    <Show when="signed-in">
      <UserButton />
    </Show>
  </header>
);

export default App;
