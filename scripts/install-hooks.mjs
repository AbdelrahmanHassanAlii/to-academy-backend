import process from 'node:process';
import console from 'node:console';

if (
  process.env.HUSKY !== '0' &&
  process.env.CI !== 'true' &&
  process.env.NODE_ENV !== 'production'
) {
  const { default: husky } = await import('husky');
  const failure = husky();
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  }
}
