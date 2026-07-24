import { useState } from 'react';

export function usePasswordVisibility() {
  const [visible, setVisible] = useState(false);

  return {
    inputType: visible ? ('text' as const) : ('password' as const),
    toggle: () => setVisible((value) => !value),
    visible,
  };
}
