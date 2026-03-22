// Configuration Manager Module
import { adaptStrapiHomepage } from './strapi-adapter.js';

export class ConfigManager {
    constructor() {
        this.config = null;
        this.cmsConfig = null;
    }

    // Load and parse config
    async loadConfig() {
        try {
            this.cmsConfig = await this.loadCMSConfig();

            if (this.cmsConfig?.enabled) {
                this.config = await this.loadFromCMS(this.cmsConfig);
            } else {
                this.config = await this.loadLocalConfig();
            }

            if (!this.config) {
                throw new Error('Failed to parse configuration - empty or invalid data');
            }

            console.log('Config loaded successfully');
            return this.config;
        } catch (error) {
            console.error('Error loading config:', error);
            this.showErrorMessage(error.message);
            return null;
        }
    }

    async loadCMSConfig() {
        try {
            const response = await fetch('./cms-config.json', { cache: 'no-store' });

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(
                    `Failed to load cms-config.json: ${response.status} ${response.statusText}`
                );
            }

            return await response.json();
        } catch (error) {
            console.warn('CMS config unavailable, falling back to local config:', error);
            return null;
        }
    }

    async loadFromCMS(cmsConfig) {
        if (cmsConfig.provider !== 'strapi') {
            throw new Error(`Unsupported CMS provider: ${cmsConfig.provider}`);
        }

        try {
            return await this.loadFromStrapi(cmsConfig);
        } catch (error) {
            if (cmsConfig.fallback_to_local_config !== false) {
                console.warn('Failed to load Strapi content, falling back to config.json:', error);
                return this.loadLocalConfig();
            }

            throw error;
        }
    }

    async loadLocalConfig() {
        const response = await fetch('./config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    async loadFromStrapi(cmsConfig) {
        const baseUrl = this.resolveStrapiBaseUrl(cmsConfig);
        const contentType = cmsConfig.content_type || 'homepage';
        const query = (cmsConfig.query || 'populate=*').replace(/^\?/, '');

        if (!baseUrl) {
            throw new Error('Strapi base URL is missing for the current environment');
        }

        const headers = {
            Accept: 'application/json'
        };

        if (cmsConfig.api_token) {
            headers.Authorization = `Bearer ${cmsConfig.api_token}`;
        }

        const endpoint = `${baseUrl}/api/${contentType}${query ? `?${query}` : ''}`;
        const response = await fetch(endpoint, { headers });

        if (!response.ok) {
            throw new Error(
                `Failed to load Strapi content: ${response.status} ${response.statusText}`
            );
        }

        const payload = await response.json();
        return adaptStrapiHomepage(payload, { baseUrl });
    }

    resolveStrapiBaseUrl(cmsConfig) {
        const hostname = window.location.hostname;
        const isLocalEnvironment = (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '[::1]' ||
            hostname.endsWith('.local')
        );

        const preferredBaseUrl = isLocalEnvironment
            ? cmsConfig.local_base_url
            : cmsConfig.production_base_url;

        return (preferredBaseUrl || cmsConfig.base_url || '').replace(/\/+$/, '');
    }

    // Display error message to user
    showErrorMessage(message) {
        document.body.innerHTML = `
            <div style="color: red; padding: 20px; text-align: center;">
                <h1>Error Loading Portfolio Content</h1>
                <p>${message}</p>
                <p>Please check your Strapi environment URLs or the local config files.</p>
            </div>`;
    }

    getConfig() {
        return this.config;
    }

    // Helper function to get section title with fallback
    getSectionTitle(sectionKey) {
        const titles = {
            about: 'About',
            projects: this.config?.projects?.title || 'Projects',
            experience: this.config?.experience?.title || 'Experience',
            skills: this.config?.skills?.title || 'Skills',
            github_projects: this.config?.github_projects?.title || 'GitHub Projects'
        };
        return titles[sectionKey] || '';
    }

    // Helper function to check if content exists for a section
    hasContent(sectionKey) {
        switch (sectionKey) {
            case 'about':
                return this.config?.about?.paragraphs?.length > 0;
            case 'projects':
                return this.config?.projects?.items?.length > 0;
            case 'experience':
                return this.config?.experience?.jobs?.length > 0;
            case 'skills':
                return this.config?.skills?.categories?.length > 0;
            case 'github_projects':
                return Boolean(this.config?.github_username);
            default:
                return true;
        }
    }
}
