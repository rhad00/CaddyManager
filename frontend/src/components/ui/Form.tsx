import { ComponentPropsWithoutRef, createContext, useContext, useId, FormEvent } from 'react';
import { FieldValues, UseFormRegister, FieldErrors, Path, UseFormReturn } from 'react-hook-form';
import { cn } from '../../utils/cn';

// Form Context
type FormContextValue<T extends FieldValues> = UseFormReturn<T>;

const FormContext = createContext<FormContextValue<any> | undefined>(undefined);

// Form Root
interface FormProps<T extends FieldValues>
  extends Omit<ComponentPropsWithoutRef<'form'>, 'onSubmit'> {
  form: FormContextValue<T>;
  onSubmit: (data: T) => void | Promise<void>;
}

export function Form<T extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  ...props
}: FormProps<T>) {
  return (
    <FormContext.Provider value={form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('space-y-6', className)}
        noValidate
        {...props}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

// Form Field
interface FormFieldProps<T extends FieldValues>
  extends Omit<ComponentPropsWithoutRef<'div'>, 'defaultValue'> {
  name: Path<T>;
  label: string;
}

export function FormField<T extends FieldValues>({
  name,
  label,
  children,
  className,
  ...props
}: FormFieldProps<T>) {
  const id = useId();
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('FormField must be used within a Form');
  }

  const error = form.formState.errors[name];
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground" id={`${id}-label`}>
        {label}
      </label>
      {children}
      {error?.message && (
        <p id={errorId} className="text-sm text-destructive" role="alert" aria-live="polite">
          {error.message as string}
        </p>
      )}
    </div>
  );
}

// Form Input
interface FormInputProps<T extends FieldValues>
  extends Omit<ComponentPropsWithoutRef<'input'>, 'name'> {
  name: Path<T>;
  label?: string;
}

export function FormInput<T extends FieldValues>({
  name,
  label,
  className,
  ...props
}: FormInputProps<T>) {
  const id = useId();
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('FormInput must be used within a Form');
  }

  const error = form.formState.errors[name];
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <input
        id={id}
        {...form.register(name)}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        aria-required={form.formState.errors[name]?.type === 'required'}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          error && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
        {...props}
      />
      {error?.message && (
        <p id={errorId} className="text-sm text-destructive" role="alert" aria-live="polite">
          {error.message as string}
        </p>
      )}
    </div>
  );
}

// Form Select
interface FormSelectProps<T extends FieldValues>
  extends Omit<ComponentPropsWithoutRef<'select'>, 'name'> {
  name: Path<T>;
  label?: string;
  options: readonly { value: string; label: string }[];
}

export function FormSelect<T extends FieldValues>({
  name,
  label,
  options,
  className,
  ...props
}: FormSelectProps<T>) {
  const id = useId();
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('FormSelect must be used within a Form');
  }

  const error = form.formState.errors[name];
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <select
        id={id}
        {...form.register(name)}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        aria-required={form.formState.errors[name]?.type === 'required'}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          error && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
        {...props}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error?.message && (
        <p id={errorId} className="text-sm text-destructive" role="alert" aria-live="polite">
          {error.message as string}
        </p>
      )}
    </div>
  );
}

// Form Switch
interface FormSwitchProps<T extends FieldValues>
  extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'name'> {
  name: Path<T>;
}

export function FormSwitch<T extends FieldValues>({
  name,
  className,
  ...props
}: FormSwitchProps<T>) {
  const form = useContext(FormContext);

  if (!form) {
    throw new Error('FormSwitch must be used within a Form');
  }

  return (
    <input
      type="checkbox"
      {...form.register(name)}
      className={cn(
        'h-4 w-4 rounded border-gray-300',
        'focus:ring-2 focus:ring-primary',
        className,
      )}
      {...props}
    />
  );
}

// Form Submit Button
export function FormSubmit({ children, className, ...props }: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="submit"
      className={cn(
        'inline-flex justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'hover:bg-primary/90',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
