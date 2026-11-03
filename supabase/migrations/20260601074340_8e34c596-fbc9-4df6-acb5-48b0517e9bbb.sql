ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;

ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS paystack_reference TEXT,
  ADD COLUMN IF NOT EXISTS paystack_transfer_code TEXT;

CREATE INDEX IF NOT EXISTS idx_payroll_paystack_transfer_code ON public.payroll(paystack_transfer_code) WHERE paystack_transfer_code IS NOT NULL;