import {
  loginInputSchema,
  passwordResetStartInputSchema,
  registrationStartInputSchema,
} from '@booking/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useSubmit } from 'react-router';
import { z } from 'zod';

export type AuthStartMode = 'register' | 'login' | 'reset';

function createAuthStartSchema(mode: AuthStartMode) {
  return z.object({
    fullName:
      mode === 'register' ? registrationStartInputSchema.shape.fullName : z.string().optional(),
    email:
      mode === 'login'
        ? loginInputSchema.shape.email
        : mode === 'reset'
          ? passwordResetStartInputSchema.shape.email
          : registrationStartInputSchema.shape.email,
    password: mode === 'login' ? loginInputSchema.shape.password : z.string().optional(),
  });
}

type AuthStartValues = z.infer<ReturnType<typeof createAuthStartSchema>>;

export function useAuthStartFormController(mode: AuthStartMode) {
  const submit = useSubmit();
  const schema = createAuthStartSchema(mode);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthStartValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const submitForm = handleSubmit((values) => submit(values, { method: 'post' }));

  return {
    errors,
    register,
    submitForm,
  };
}
