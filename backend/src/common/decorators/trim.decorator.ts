/**
 * HOW THIS FILE WORKS
 *   1. Wrap class-transformer's @Transform so it runs before any validator on the property.
 *   2. Trim strings; pass anything else through untouched.
 */
import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Trim a string property BEFORE the validators run.
 *
 * Ordering is the whole point: class-transformer runs first, so "   " arrives at @MinLength(1) as
 * "" and is rejected, rather than passing as three characters of whitespace.
 *
 * Non-string values are passed through untouched so @IsString() — not this decorator — is what
 * reports a wrong type. Trimming a number here would turn a type error into a confusing one.
 *
 * The return type is annotated `unknown` rather than left inferred because TransformFnParams.value
 * is `any`; without it, every usage site trips @typescript-eslint/no-unsafe-return. Stating it once
 * here is why the two DTOs that use this can stay under the project's full type-strictness.
 */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown =>
    // Step 2. The typeof check is what keeps a wrong type reportable by @IsString().
    typeof value === 'string' ? value.trim() : value,
  );
