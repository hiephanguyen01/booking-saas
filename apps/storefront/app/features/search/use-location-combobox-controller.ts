import { useId, useState } from 'react';

type LocationOption = {
  value: string;
  label: string;
};

export function useLocationComboboxController({
  initialValue,
  options,
}: {
  initialValue: string;
  options: LocationOption[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  function select(nextValue: string): void {
    setValue(nextValue);
    setOpen(false);
  }

  return {
    listId,
    open,
    select,
    selected,
    setOpen,
    value,
  };
}
