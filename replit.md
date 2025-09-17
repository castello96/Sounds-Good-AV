# Overview

Sounds Good AV is a professional audio-visual equipment rental website built with React, TypeScript, and Express. The application serves as a business website for an AV rental company that provides sound systems, microphones, and related equipment to bands, event organizers, podcasters, and presenters. The site features a modern, professional design with a contact form for quote requests and showcases the company's services and target customers.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React with TypeScript**: Modern React application using functional components and hooks
- **Vite**: Build tool and development server for fast development experience
- **Wouter**: Lightweight client-side routing library for navigation
- **TanStack Query**: Server state management and data fetching with caching capabilities
- **shadcn/ui Components**: Comprehensive UI component library built on Radix UI primitives
- **Tailwind CSS**: Utility-first CSS framework with custom design system implementation

## Design System
- **Component Library**: Extensive collection of reusable UI components (buttons, forms, cards, navigation)
- **Theme System**: Custom color palette with support for light/dark mode switching
- **Typography**: Inter font family with consistent sizing and weight hierarchy
- **Responsive Design**: Mobile-first approach with responsive breakpoints

## Backend Architecture
- **Express.js**: RESTful API server handling form submissions and business logic
- **Node.js with ES Modules**: Modern JavaScript runtime with module system
- **Zod**: Schema validation for form data and API requests
- **Email Integration**: Contact form processing with email notification system

## Data Layer
- **Drizzle ORM**: Type-safe database toolkit configured for PostgreSQL
- **Database Schema**: Simple schema for quote requests with form validation
- **Neon Database**: PostgreSQL database service integration

## Key Features
- **Hero Section**: Full-screen landing with gradient background and call-to-action buttons
- **Service Showcase**: Cards displaying company benefits and target customer segments
- **Contact Form**: Quote request form with validation and email notifications
- **Responsive Navigation**: Mobile-friendly navigation with theme toggle
- **Theme Switching**: Light/dark mode toggle with persistent user preference

## Development Tools
- **TypeScript**: Full type safety across frontend and backend
- **Path Aliases**: Organized import structure with @ prefixes for cleaner code
- **Development Environment**: Hot reloading and error overlay for efficient development

# External Dependencies

## UI and Styling
- **Radix UI**: Headless component primitives for accessible UI elements
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **Lucide React**: Icon library for consistent iconography
- **Class Variance Authority**: Type-safe component variant management

## Database and ORM
- **Neon Database**: Serverless PostgreSQL database platform
- **Drizzle ORM**: Type-safe database toolkit with schema management
- **Drizzle Kit**: Database migration and schema management tools

## Development and Build
- **Vite**: Fast build tool and development server
- **TypeScript**: Type checking and enhanced developer experience
- **ESBuild**: Fast JavaScript bundler for production builds

## Email Services
- **Resend API**: Email service for contact form notifications (production)
- **SMTP Fallback**: Alternative email delivery method

## Validation and Forms
- **Zod**: Runtime type validation and schema definition
- **React Hook Form**: Form state management and validation
- **Hookform Resolvers**: Integration between React Hook Form and Zod

## State Management
- **TanStack React Query**: Server state management and caching
- **React Context**: Client-side state management for theme and UI state