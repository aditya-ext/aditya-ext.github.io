// Strapi Adapter Module

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStrapiValue(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeStrapiValue);
    }

    if (!isPlainObject(value)) {
        return value;
    }

    const keys = Object.keys(value);

    // Handle Strapi relation/media wrappers like { data: ... }.
    if ('data' in value && keys.every(key => key === 'data' || key === 'meta')) {
        return normalizeStrapiValue(value.data);
    }

    const source = isPlainObject(value.attributes) ? value.attributes : value;
    const normalized = {};

    Object.entries(source).forEach(([key, currentValue]) => {
        if (key === 'attributes') {
            return;
        }

        normalized[key] = normalizeStrapiValue(currentValue);
    });

    if ('id' in value && normalized.id === undefined) {
        normalized.id = value.id;
    }

    if ('documentId' in value && normalized.documentId === undefined) {
        normalized.documentId = value.documentId;
    }

    return normalized;
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (value === undefined || value === null) {
        return [];
    }

    return [value];
}

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null);
}

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }

    return fallback;
}

function extractRichText(node) {
    if (!node) {
        return '';
    }

    if (typeof node === 'string') {
        return node.trim();
    }

    if (Array.isArray(node)) {
        return node.map(extractRichText).filter(Boolean).join(' ').trim();
    }

    if (isPlainObject(node)) {
        if (typeof node.text === 'string') {
            return node.text.trim();
        }

        if (typeof node.value === 'string') {
            return node.value.trim();
        }

        if (Array.isArray(node.children)) {
            return extractRichText(node.children);
        }
    }

    return '';
}

function toTextArray(value) {
    return toArray(value)
        .map(item => {
            if (typeof item === 'string') {
                return item.trim();
            }

            if (isPlainObject(item) && typeof item.text === 'string') {
                return item.text.trim();
            }

            return extractRichText(item);
        })
        .filter(Boolean);
}

function joinUrl(baseUrl, path) {
    if (!path) {
        return '';
    }

    if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) {
        return path;
    }

    const trimmedBase = (baseUrl || '').replace(/\/+$/, '');
    const trimmedPath = path.startsWith('/') ? path : `/${path}`;

    return `${trimmedBase}${trimmedPath}`;
}

function resolveMediaUrl(baseUrl, media) {
    const normalizedMedia = normalizeStrapiValue(media);

    if (!normalizedMedia) {
        return '';
    }

    const preferredUrl = firstDefined(
        normalizedMedia.url,
        normalizedMedia.formats?.large?.url,
        normalizedMedia.formats?.medium?.url,
        normalizedMedia.formats?.small?.url,
        normalizedMedia.formats?.thumbnail?.url
    );

    return joinUrl(baseUrl, preferredUrl);
}

function resolveMediaOrUrl(baseUrl, value) {
    if (!value) {
        return '';
    }

    if (typeof value === 'string') {
        return joinUrl(baseUrl, value);
    }

    if (isPlainObject(value)) {
        return resolveMediaUrl(baseUrl, value);
    }

    return '';
}

function mapSocialLink(item) {
    const social = normalizeStrapiValue(item);

    if (!social) {
        return null;
    }

    const name = firstDefined(social.name, social.label);
    const url = firstDefined(social.url, social.href);
    const icon = firstDefined(social.icon, social.iconName, social.templateIcon);

    if (!name || !url || !icon) {
        return null;
    }

    return {
        name,
        url,
        icon,
        required: toBoolean(firstDefined(social.required, social.isRequired), true)
    };
}

function mapProject(item, baseUrl) {
    const project = normalizeStrapiValue(item);

    if (!project) {
        return null;
    }

    const pictureUrl = firstDefined(
        resolveMediaOrUrl(baseUrl, project.picture),
        resolveMediaOrUrl(baseUrl, project.pictureUrl),
        resolveMediaOrUrl(baseUrl, project.image)
    );

    return {
        name: firstDefined(project.name, project.title, 'Untitled Project'),
        date: firstDefined(project.date, project.timeframe, ''),
        description: toTextArray(firstDefined(project.description, project.highlights, project.points)),
        link: project.link || (
            project.url
                ? {
                    url: project.url,
                    title: firstDefined(project.linkTitle, project.ctaLabel, 'View Project')
                }
                : undefined
        ),
        picture: pictureUrl || undefined
    };
}

function mapExperienceJob(item, baseUrl) {
    const job = normalizeStrapiValue(item);

    if (!job) {
        return null;
    }

    return {
        company: firstDefined(job.company, job.companyName, 'Unknown Company'),
        role: firstDefined(job.role, job.title, 'Role'),
        date: firstDefined(job.date, job.duration, ''),
        responsibilities: toTextArray(
            firstDefined(job.responsibilities, job.highlights, job.points)
        ),
        logo: firstDefined(
            resolveMediaOrUrl(baseUrl, job.logo),
            resolveMediaOrUrl(baseUrl, job.logoUrl),
            resolveMediaOrUrl(baseUrl, job.logoImage)
        ) || undefined,
        logo_dark: firstDefined(
            resolveMediaOrUrl(baseUrl, job.logo_dark),
            resolveMediaOrUrl(baseUrl, job.logoDark),
            resolveMediaOrUrl(baseUrl, job.darkLogo),
            resolveMediaOrUrl(baseUrl, job.logoDarkImage)
        ) || undefined
    };
}

function mapSkillItem(item) {
    if (typeof item === 'string') {
        return item.trim();
    }

    if (!isPlainObject(item)) {
        return extractRichText(item);
    }

    if (item.name && item.url) {
        return {
            name: item.name,
            url: item.url
        };
    }

    return firstDefined(item.label, item.value, item.name, extractRichText(item));
}

function mapSkillCategory(item) {
    const category = normalizeStrapiValue(item);

    if (!category) {
        return null;
    }

    const items = toArray(firstDefined(category.items, category.values, category.skills))
        .map(mapSkillItem)
        .filter(Boolean);

    return {
        name: firstDefined(category.name, category.title, 'Skills'),
        items
    };
}

export function adaptStrapiHomepage(response, options = {}) {
    const baseUrl = options.baseUrl || '';
    const root = normalizeStrapiValue(response?.data ?? response);

    if (!root || !isPlainObject(root)) {
        throw new Error('Strapi homepage response is empty or invalid');
    }

    const site = normalizeStrapiValue(firstDefined(root.site, root.siteConfig)) || {};
    const seo = normalizeStrapiValue(firstDefined(site.seo, root.seo)) || {};
    const header = normalizeStrapiValue(root.header) || {};
    const features = normalizeStrapiValue(root.features) || {};
    const footer = normalizeStrapiValue(root.footer) || {};

    const socialLinks = toArray(firstDefined(root.socialLinks, root.social_links))
        .map(mapSocialLink)
        .filter(Boolean);

    const projectItems = toArray(firstDefined(root.featuredProjects, root.projects?.items))
        .map(item => mapProject(item, baseUrl))
        .filter(Boolean);

    const experienceJobs = toArray(firstDefined(root.experienceJobs, root.experience?.jobs))
        .map(item => mapExperienceJob(item, baseUrl))
        .filter(Boolean);

    const skillCategories = toArray(firstDefined(root.skillCategories, root.skills?.categories))
        .map(mapSkillCategory)
        .filter(Boolean);

    return {
        features: {
            about: toBoolean(features.about, true),
            projects: toBoolean(features.projects, true),
            experience: toBoolean(features.experience, true),
            skills: toBoolean(features.skills, true),
            github_projects: toBoolean(
                firstDefined(features.github_projects, features.githubProjects),
                true
            )
        },
        site: {
            title: firstDefined(site.title, root.siteTitle, root.title, ''),
            description: firstDefined(site.description, root.siteDescription, root.description, ''),
            seo: {
                title: firstDefined(seo.title, seo.metaTitle, root.seoTitle, ''),
                description: firstDefined(
                    seo.description,
                    seo.metaDescription,
                    root.seoDescription,
                    ''
                ),
                keywords: firstDefined(seo.keywords, root.seoKeywords, ''),
                author: firstDefined(seo.author, root.author, ''),
                og_image: firstDefined(
                    resolveMediaOrUrl(baseUrl, seo.og_image),
                    resolveMediaOrUrl(baseUrl, seo.ogImage),
                    resolveMediaOrUrl(baseUrl, seo.ogImageUrl),
                    resolveMediaOrUrl(baseUrl, seo.ogImageAsset),
                    ''
                ),
                twitter_card: firstDefined(seo.twitter_card, seo.twitterCard, 'summary_large_image'),
                base_url: firstDefined(seo.base_url, seo.baseUrl, root.baseUrl, '')
            }
        },
        header: {
            greeting: firstDefined(header.greeting, root.greeting, ''),
            tagline: firstDefined(header.tagline, root.tagline, '')
        },
        social_links: socialLinks,
        github_username: firstDefined(root.githubUsername, root.github_username, ''),
        about: {
            paragraphs: toTextArray(
                firstDefined(root.aboutParagraphs, root.about?.paragraphs, root.about)
            )
        },
        projects: {
            title: firstDefined(root.projectsTitle, root.projects?.title, 'Featured Projects'),
            items: projectItems
        },
        experience: {
            title: firstDefined(
                root.experienceTitle,
                root.experience?.title,
                'Professional Experience'
            ),
            jobs: experienceJobs
        },
        skills: {
            title: firstDefined(root.skillsTitle, root.skills?.title, 'Skills & Technologies'),
            categories: skillCategories
        },
        footer: {
            show_social_links: toBoolean(
                firstDefined(footer.show_social_links, footer.showSocialLinks),
                true
            ),
            show_built_with: toBoolean(
                firstDefined(footer.show_built_with, footer.showBuiltWith),
                false
            ),
            built_with_text: firstDefined(
                footer.built_with_text,
                footer.builtWithText,
                ''
            ),
            tagline: firstDefined(footer.tagline, '')
        }
    };
}
