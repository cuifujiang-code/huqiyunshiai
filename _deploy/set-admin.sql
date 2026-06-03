-- 一键设管理员：把下面 UUID 换成你的 profiles.id 后执行
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-000000000000';

-- 或按手机号（E.164，与登录一致）
-- UPDATE public.profiles SET role = 'admin' WHERE phone = '+8613800138000';

SELECT id, phone, role FROM public.profiles WHERE role = 'admin';
