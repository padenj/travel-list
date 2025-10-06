// Item-Category assignment APIs
export const assignItemToCategory = async (itemId: string, categoryId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/categories/${categoryId}`, {
    method: 'POST',
  });
};

export const removeItemFromCategory = async (itemId: string, categoryId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/categories/${categoryId}`, {
    method: 'DELETE',
  });
};
// Category APIs
export const getCategories = async (familyId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/categories/${familyId}`);
};

export const createCategory = async (familyId: string, name: string): Promise<ApiResponse> => {
  return authenticatedApiCall('/categories', {
    method: 'POST',
    body: JSON.stringify({ familyId, name }),
  });
};

export const updateCategory = async (id: string, name: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
};

export const deleteCategory = async (id: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/categories/${id}`, {
    method: 'DELETE',
  });
};
// Item APIs
export const getItems = async (familyId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${familyId}`);
};

export const createItem = async (familyId: string, name: string): Promise<ApiResponse> => {
  return authenticatedApiCall('/items', {
    method: 'POST',
    body: JSON.stringify({ familyId, name }),
  });
};

export const updateItem = async (id: string, name: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
};

export const deleteItem = async (id: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${id}`, {
    method: 'DELETE',
  });
};

export const getCategoriesForItem = async (itemId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/categories`);
};

export const getItemsForCategory = async (categoryId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/categories/${categoryId}/items`);
};

export const getMembersForItem = async (itemId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/members`);
};

export const isAssignedToWholeFamily = async (itemId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/whole-family`);
};

export const assignToMember = async (itemId: string, memberId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/members/${memberId}`, {
    method: 'POST',
  });
};

export const removeFromMember = async (itemId: string, memberId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/members/${memberId}`, {
    method: 'DELETE',
  });
};

export const assignToWholeFamily = async (itemId: string, familyId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/whole-family/${familyId}`, {
    method: 'POST',
  });
};

export const removeFromWholeFamily = async (itemId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/whole-family`, {
    method: 'DELETE',
  });
};

export const setChecked = async (itemId: string, checked: boolean): Promise<ApiResponse> => {
  return authenticatedApiCall(`/items/${itemId}/checked`, {
    method: 'PUT',
    body: JSON.stringify({ checked }),
  });
};

  // Template APIs
  export const createTemplate = async (familyId: string, name: string, description?: string): Promise<ApiResponse> => {
    return authenticatedApiCall('/templates', {
      method: 'POST',
      body: JSON.stringify({ family_id: familyId, name, description }),
    });
  };

  export const getTemplates = async (familyId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/templates/${familyId}`);
  };

  export const getTemplate = async (id: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${id}`);
  };

  export const updateTemplate = async (id: string, updates: any): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  };

  export const deleteTemplate = async (id: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${id}`, {
      method: 'DELETE',
    });
  };

  export const assignCategoryToTemplate = async (templateId: string, categoryId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/categories/${categoryId}`, {
      method: 'POST',
    });
  };

  export const removeCategoryFromTemplate = async (templateId: string, categoryId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/categories/${categoryId}`, {
      method: 'DELETE',
    });
  };

  export const assignItemToTemplate = async (templateId: string, itemId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/items/${itemId}`, {
      method: 'POST',
    });
  };

  export const removeItemFromTemplate = async (templateId: string, itemId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/items/${itemId}`, {
      method: 'DELETE',
    });
  };

  export const getExpandedItemsForTemplate = async (templateId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/expanded-items`);
  };

  export const getCategoriesForTemplate = async (templateId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/categories`);
  };

  export const getItemsForTemplate = async (templateId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/items`);
  };

  export const syncTemplateItems = async (templateId: string, itemIds: string[]): Promise<ApiResponse> => {
    return authenticatedApiCall(`/template/${templateId}/sync-items`, {
      method: 'POST',
      body: JSON.stringify({ itemIds }),
    });
  };
// Family member management APIs
export const createFamilyMember = async (familyId: string, memberData: {
  name: string;
  canLogin?: boolean;
  username?: string;
  password?: string;
  role?: string;
}): Promise<ApiResponse> => {
  return authenticatedApiCall(`/families/${familyId}/members`, {
    method: 'POST',
    body: JSON.stringify(memberData),
  });
};

export const editFamilyMember = async (familyId: string, memberId: string, memberData: {
  name: string;
  username?: string;
  role?: string;
}): Promise<ApiResponse> => {
  return authenticatedApiCall(`/families/${familyId}/members/${memberId}`, {
    method: 'PUT',
    body: JSON.stringify(memberData),
  });
};

export const resetFamilyMemberPassword = async (familyId: string, memberId: string, newPassword: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/families/${familyId}/members/${memberId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
};
// API utility functions with improved error handling and type safety
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api';

interface ApiCallOptions extends RequestInit {
  headers?: Record<string, string>;
}

interface ApiResponse<T = any> {
  response: Response;
  data: T;
}

// Removed unused interface - using inline types instead

// Enhanced token management with automatic cleanup
class TokenManager {
  private static instance: TokenManager;
  private token: string | null = null;
  private readonly TOKEN_KEY = 'authToken';

  private constructor() {
    const storedToken = localStorage.getItem(this.TOKEN_KEY);
    if (storedToken && !this.isTokenExpired(storedToken)) {
      this.token = storedToken;
    } else if (storedToken) {
      // Clear expired token from localStorage
      localStorage.removeItem(this.TOKEN_KEY);
      this.token = null;
    }
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  getToken(): string | null {
    // Check if token is expired and clear it automatically
    if (this.token && this.isTokenExpired(this.token)) {
      this.clearToken();
      return null;
    }
    return this.token;
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem(this.TOKEN_KEY);
  }

  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }
}

const tokenManager = TokenManager.getInstance();

export const setAuthToken = (token: string): void => {
  tokenManager.setToken(token);
};

export const clearAuthToken = (): void => {
  tokenManager.clearToken();
};

export const getAuthToken = (): string | null => {
  return tokenManager.getToken();
};

// Helper function to clear authentication state (useful for debugging)
export const clearAuthenticationState = (): void => {
  clearAuthToken();
  console.log('Authentication state cleared. Page will reload.');
  window.location.reload();
};

// Make clearAuthenticationState available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).clearAuthenticationState = clearAuthenticationState;
}

export const apiCall = async (endpoint: string, options: ApiCallOptions = {}): Promise<ApiResponse> => {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log('🌐 API Call:', url, 'with options:', options);

  // Always force Content-Type to application/json for POST/PUT requests
  const method = options.method?.toUpperCase();
  const headers = {
    ...options.headers,
  };
  if (method === 'POST' || method === 'PUT') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log('📡 API Response status:', response.status, response.statusText);
  const data = await response.json();
  console.log('📋 API Response data:', data);

  return { response, data };
};

export const login = async (username: string, password: string): Promise<ApiResponse> => {
  return apiCall('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
};

export const changePassword = async (username: string, oldPassword: string, newPassword: string): Promise<ApiResponse> => {
  return apiCall('/change-password', {
    method: 'POST',
    body: JSON.stringify({ username, oldPassword, newPassword }),
  });
};

// Authenticated API call wrapper
const authenticatedApiCall = async (endpoint: string, options: ApiCallOptions = {}): Promise<ApiResponse> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const response = await apiCall(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });

  // If we get a 401, the token is invalid - clear it and force re-login
  if (response.response.status === 401) {
    console.log('🔒 Token is invalid, clearing authentication');
    console.log('🔒 Response data:', response.data);
    clearAuthToken();
    // Reload the page to trigger the login flow
    window.location.reload();
  }

  return response;
};

// User management APIs
export const getUsers = async (): Promise<ApiResponse> => {
  return authenticatedApiCall('/users');
};

export const getCurrentUserProfile = async (): Promise<ApiResponse> => {
  return authenticatedApiCall('/users/me');
};

export const createUser = async (userData: {
  username: string;
  password: string;
  role: string;
  email: string;
  familyId?: string;
}): Promise<ApiResponse> => {
  return authenticatedApiCall('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
};

export const deleteUser = async (userId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/users/${userId}`, {
    method: 'DELETE',
  });
};

// Family management APIs
export const getFamilies = async (): Promise<ApiResponse> => {
  return authenticatedApiCall('/families');
};

export const getFamily = async (familyId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/families/${familyId}`);
};

export const createFamily = async (familyData: { name: string }): Promise<ApiResponse> => {
  return authenticatedApiCall('/families', {
    method: 'POST',
    body: JSON.stringify(familyData),
  });
};

export const deleteFamily = async (familyId: string): Promise<ApiResponse> => {
  return authenticatedApiCall(`/families/${familyId}`, {
    method: 'DELETE',
  });
};