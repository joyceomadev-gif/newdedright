
-- Fix Anita's staff email typo and link to her auth account
UPDATE public.staff
SET email = 'anitausdrey@gmail.com',
    user_id = '9b63c6ec-4a70-4d18-9caf-f31bde977300'
WHERE id = '2590287d-ea70-4674-9686-11c47ec41b61';

-- Link Emmanuel David (email already matches his auth account)
UPDATE public.staff
SET user_id = 'eafdc6ef-7978-4050-b829-4f48b4f7a7d7'
WHERE id = '6a0f0599-c080-42de-ab74-8a209170fc7f'
  AND user_id IS NULL;
