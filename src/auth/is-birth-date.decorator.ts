import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_BIRTH_DATE = '1900-01-01';

export function IsBirthDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isBirthDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
            return false;
          }

          const date = new Date(`${value}T00:00:00.000Z`);
          if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value
          ) {
            return false;
          }

          const today = new Date().toISOString().slice(0, 10);
          return value >= EARLIEST_BIRTH_DATE && value <= today;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a real date in YYYY-MM-DD format and cannot be in the future`;
        },
      },
    });
  };
}
