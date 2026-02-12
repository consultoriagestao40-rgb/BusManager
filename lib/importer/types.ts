export interface NormalizedEvent {
    client_vehicle_number: string;
    data_viagem: Date;
    hora_viagem: string; // HH:mm

    // Informational
    classe?: string;
    situacao_totalbus?: string;
    empresa?: string;
    itinerario?: string;
    numero_servico?: string;
    motorista?: string;
    setor_limpeza?: string;
    observacao_cliente?: string;

    // Generated
    event_business_key: string;
    saida_programada_at: Date;
}

export interface ParseResult {
    success: boolean;
    events: NormalizedEvent[];
    errors: string[];
    metadata?: any;
}
