# scraper.py
import asyncio
from playwright.async_api import async_playwright
import datetime
import os
import psycopg2
import csv
import random

from typing import List, Tuple, Any

CSV_FIELDS = [
    'date_releve', 
    'nom_produit', 
    'marque', 
    'quantite', 
    'unite_mesure', 
    'prix_unitaire', 
    'epicerie'
]

def export_to_csv(data: List[Tuple[Any, ...]], filename: str = 'maxi_prix_releve.csv'):
    """
    Exporte une liste de tuples (les résultats du scraping) vers un fichier CSV.

    Args:
        data (List[Tuple]): La liste des données à exporter. Chaque tuple doit
                            respecter l'ordre défini dans CSV_FIELDS.
        filename (str): Le nom du fichier CSV de sortie.
    """
    # Si le fichier existe, nous écrivons SANS l'en-tête (pour ajouter des lignes).
    # Si le fichier n'existe PAS, nous écrivons AVEC l'en-tête.
    file_exists = False
    
    try:
        # 'a' pour mode append (ajouter à la fin du fichier)
        with open(filename, mode='w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            
            # Écrire l'en-tête si le fichier est créé maintenant
            if not file_exists:
                writer.writerow(CSV_FIELDS)
                print(f"Fichier CSV créé avec en-tête : {filename}")
            
            # Écrire toutes les lignes de données
            writer.writerows(data)
            
        print(f"Exportation de {len(data)} lignes vers {filename} réussie.")

    except Exception as e:
        print(f"ERREUR lors de l'écriture du fichier CSV : {e}")





def scrape_groceries():
    scrape_maxi()

async def scrape_wal_mart():
    url = 'https://www.walmart.ca/en/shop/weekly-flyer-features/6000196190101?catId=10019&icid=browse_l1_grocery_weekly_flyer_19028_2TQWLPJF04'
    
async def scrape_metro():
    url = "https://www.metro.ca/en/online-grocery/flyer?sortOrder=relevance&filter=%3Arelevance%3Adeal%3AFlyer+%26+Deals"    
    
async def scrape_maxi():
    url = "https://www.maxi.ca/fr/deals/flyer"
    fetch_date = datetime.datetime.now().date().isoformat()
    results = []
    
    async with async_playwright() as p:
        browser = await p.firefox.launch(headless = True)
        page = await browser.new_page()
        
        await page.goto(url, wait_until="domcontentloaded")
        
        initial_wait_time = random.uniform(1.5, 3.0)
        print(f"Waiting for {initial_wait_time:.2f} seconds before starting...")
        await page.wait_for_timeout(initial_wait_time * 1000)
        
        current_page = 1
        
        NEXT_PAGE_SELECTOR = '[aria-label="Page suivante"]'
        DEAL_CONTAINER_SELECTOR = 'div[data-testid="product-grid-component"] > .css-0'
        SALE_PRICE_SELECTOR = 'span[data-testid="sale-price"]'
        REGULAR_PRICE_SELECTOR = 'span[data-testid="regular-price"]'
        
        
        
        while True:
            
            try:
                await page.wait_for_selector(DEAL_CONTAINER_SELECTOR, timeout = 20000)
            except Exception as e:
                break
            
            deals = await page.locator(DEAL_CONTAINER_SELECTOR).all()
            
            print(deals)
            
            for deal in deals:
                try:
                    
                    # Marque
                    brand_locator = deal.locator('p[data-testid="product-brand"]')
                    brand_name = await brand_locator.inner_text() if await brand_locator.is_visible() else "N/D"

                    # Nom de l'item
                    title_locator = deal.locator('h3[data-testid="product-title"]')
                    item_name = await title_locator.inner_text() if await title_locator.is_visible() else "N/D"
                    
                    # Quantité/Unité (format brut)
                    size_locator = deal.locator('p[data-testid="product-package-size"]')
                    raw_size_unit = await size_locator.inner_text() if await size_locator.is_visible() else "N/D"

                    # Nettoyage de la Quantité/Unité pour séparer le format principal
                    unit_quantity_brut = raw_size_unit.split(',')[0].strip()
                    
                    # Séparer la quantité numérique du texte d'unité
                    parts = unit_quantity_brut.split(' ')
                    
                    if len(parts) >= 2:
                        # La dernière partie est l'unité, le reste est la quantité
                        unit_of_measure = parts[-1].strip() # 'g', 'L', 'ml', 'kg', 'un'
                        quantity_str = " ".join(parts[:-1]).strip() # '135', '2'
                    elif parts:
                        # Cas où il n'y a pas d'espace (ex: "1kg" ou "1unite") - Nécessite une vérification manuelle
                        # Pour simplifier, si un seul mot, on le prend comme unité et la quantité est 1
                        unit_of_measure = parts[0]
                        quantity_str = "1"
                    else:
                        unit_of_measure = "N/D"
                        quantity_str = "0"
                        
                    # Conversion finale de la quantité en nombre
                    try:
                        quantity = float(quantity_str.replace(',', '.'))
                    except ValueError:
                        quantity = 0.0
                    
                    # Price fetch from products on page
                    raw_unit_price = deal.locator(SALE_PRICE_SELECTOR)
                    brut_price = None
                    
                    if await raw_unit_price.is_visible():
                        full_text = await raw_unit_price.inner_text()
                        brut_price = full_text.replace('sale', '').strip()
                        print(f'Prix rabais: {brut_price}')
                        
                    else:
                        regular_price_locator = deal.locator(REGULAR_PRICE_SELECTOR)
                        
                        if await regular_price_locator.is_visible():
                            full_text = await regular_price_locator.inner_text()
                            brut_price = full_text.replace('regular', '').strip()
                            print(f'Prix regulier: {brut_price}')
                        else:
                            print('no price found')
                            

                    # price formating
                    unit_price = None
                    if brut_price:
                        unit_price = brut_price.replace('$', '').replace('\u00a0', '').replace(',', '.').strip()
                        print(f'Prix unit: {unit_price}')
                        try:
                            unit_price = float(unit_price)
                        except ValueError:
                            print(f"Erreur de conversion du prix : {unit_price}")
                            pass
                    
                    if unit_price is not None and item_name != "N/D":
                        results.append((
                            fetch_date,
                            item_name,
                            brand_name,
                            unit_of_measure,
                            quantity,
                            unit_price,
                            'Maxi'
                        ))
                except Exception as e:
                    print(f"Erreur lors du traitement d'un deal : {e}")
                    continue
            
            await browser.close()
            return results
            
            next_button = page.locator(NEXT_PAGE_SELECTOR)
            
            if await next_button.is_visible() and not await next_button.is_disabled():
                print("  -> Navigation vers la page suivante.")
                await next_button.click()
                page_wait_time = random.uniform(3.0, 6.0)
                print(f"  -> Waiting for {page_wait_time:.2f} seconds for next page to load.")
                await page.wait_for_timeout(page_wait_time * 1000)
                current_page += 1
                print(f"  -> Page # {current_page}")
            else:
                print("Fin de la pagination atteinte ou bouton 'Suivant' non trouvé.")
                break


        await browser.close()
        return results
                
            
            
        

def insert_data_supabase(data):
    # L'accès aux variables d'environnement
    DB_HOST = os.environ.get("SUPABASE_DB_HOST")
    DB_USER = os.environ.get("SUPABASE_DB_USER")
    DB_PASSWORD = os.environ.get("SUPABASE_DB_PASSWORD")
    DB_NAME = os.environ.get("SUPABASE_DB_NAME")
    
    conn = None
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        cur = conn.cursor()
        sql_insert = """
            INSERT INTO prix_epicerie (date_releve, nom_produit, prix_unitaire, format, epicerie)
            VALUES (%s, %s, %s, %s, %s)
        """
        cur.executemany(sql_insert, data)
        conn.commit()
        print(f"Insertion de {len(data)} lignes réussie dans Supabase.")
    except Exception as error:
        print(f"ÉCHEC de l'insertion dans Supabase : {error}")
    finally:
        if conn:
            cur.close()
            conn.close()

async def main():
    resultats_maxi = await scrape_maxi()
    export_to_csv(resultats_maxi, 'prix_circulaire_complet.csv')
    
    
    ##if resultats_maxi:
        ##insert_data_supabase(resultats_maxi)

if __name__ == "__main__":
    # Nécessaire pour exécuter les fonctions asynchrones de Playwright
    asyncio.run(main())