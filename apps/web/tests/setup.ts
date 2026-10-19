process.env.DATABASE_URL ??= 'postgresql://mp_user:mp_pass_change_me@localhost:5432/maintainpredict';
process.env.JWT_SECRET ??= 'test_secret_at_least_32_characters_long_x';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_at_least_32_characters_long';
process.env.SENSOR_API_KEY ??= 'sensor_key_change_me';
