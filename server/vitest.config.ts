export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  },
};
