
CREATE OR REPLACE FUNCTION public.record_payment_transaction(
  _fee_id uuid,
  _reference text,
  _amount numeric,
  _payment_method text,
  _paid_at timestamptz,
  _raw_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fee_row public.fees%ROWTYPE;
  new_paid numeric;
  new_status fee_status;
  paid_date_val date;
BEGIN
  SELECT * INTO fee_row FROM public.fees WHERE id = _fee_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fee_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Unique violation on reference will abort the whole transaction.
  INSERT INTO public.payment_transactions (
    fee_id, reference, amount, payment_method, paid_at, raw_payload
  ) VALUES (
    _fee_id, _reference, _amount, _payment_method, _paid_at, _raw_payload
  );

  new_paid := COALESCE(fee_row.amount_paid, 0) + _amount;
  IF new_paid >= fee_row.amount THEN
    new_status := 'paid'::fee_status;
    paid_date_val := _paid_at::date;
  ELSE
    new_status := 'partial'::fee_status;
    paid_date_val := NULL;
  END IF;

  UPDATE public.fees
    SET amount_paid    = new_paid,
        status         = new_status,
        payment_method = _payment_method,
        reference      = _reference,
        paid_date      = paid_date_val
    WHERE id = _fee_id;

  RETURN jsonb_build_object(
    'fee_id', _fee_id,
    'status', new_status,
    'amount_paid', new_paid
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment_transaction(uuid, text, numeric, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
