import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Introduce tu correo electrónico")
  .pipe(z.email("Introduce un correo electrónico válido"));

/** Mínimo 8 caracteres, con al menos una letra y un número. */
const newPassword = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede superar los 72 caracteres")
  .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
  .regex(/[0-9]/, "La contraseña debe incluir al menos un número");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Introduce tu contraseña"),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Introduce tu nombre")
      .max(120, "El nombre es demasiado largo"),
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, "Repite la contraseña"),
    acceptPrivacy: z.boolean().refine((value) => value, {
      message: "Debes aceptar la política de privacidad para crear la cuenta",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, "Repite la contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
