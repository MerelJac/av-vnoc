declare module "@auth/core/types" {
  interface User {
    isSuperAdmin: boolean;
  }

  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    isSuperAdmin: boolean;
  }
}
