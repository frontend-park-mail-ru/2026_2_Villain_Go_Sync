declare module '*.hbs' {
  const template: (context?: object) => string;
  export default template;
}

declare module '*.scss';

declare const process: {
  env: {
    API_URL: string;
  };
};
