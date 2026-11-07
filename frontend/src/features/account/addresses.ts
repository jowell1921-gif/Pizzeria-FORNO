import { z } from "zod";

import { apiRequest, apiRequestVoid } from "@/lib/api";

export const addressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  recipientName: z.string(),
  phone: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  province: z.string().nullable(),
  notes: z.string().nullable(),
  isDefault: z.boolean(),
});

export type Address = z.infer<typeof addressSchema>;

const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

/** Formulario de dirección. Los campos opcionales vacíos se envían como null. */
export const addressFormSchema = z.object({
  label: z.string().trim().max(40, "Máximo 40 caracteres"),
  recipientName: z.string().trim().min(1, "Indica quién recibe el pedido").max(120),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || PHONE_PATTERN.test(value), "Introduce un teléfono válido"),
  line1: z.string().trim().min(3, "Introduce la calle y el número").max(160),
  line2: z.string().trim().max(160),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, "El código postal tiene 5 dígitos"),
  city: z.string().trim().min(1, "Introduce la ciudad").max(80),
  notes: z.string().trim().max(300, "Máximo 300 caracteres"),
  isDefault: z.boolean(),
});

export type AddressFormValues = z.infer<typeof addressFormSchema>;

const emptyToNull = (value: string) => (value === "" ? null : value);

function toBody(values: AddressFormValues) {
  return {
    label: emptyToNull(values.label),
    recipientName: values.recipientName,
    phone: emptyToNull(values.phone),
    line1: values.line1,
    line2: emptyToNull(values.line2),
    postalCode: values.postalCode,
    city: values.city,
    notes: emptyToNull(values.notes),
    isDefault: values.isDefault,
  };
}

export const fetchAddresses = (token: string) =>
  apiRequest("/me/addresses", { token, schema: z.array(addressSchema) });

export const createAddress = (token: string, values: AddressFormValues) =>
  apiRequest("/me/addresses", {
    token,
    method: "POST",
    body: toBody(values),
    schema: addressSchema,
  });

export const updateAddress = (token: string, id: string, values: Partial<AddressFormValues>) =>
  apiRequest(`/me/addresses/${id}`, {
    token,
    method: "PATCH",
    body: values.line1 === undefined ? values : toBody(values as AddressFormValues),
    schema: addressSchema,
  });

export const deleteAddress = (token: string, id: string) =>
  apiRequestVoid(`/me/addresses/${id}`, { token, method: "DELETE" });
